import { createHash, randomUUID } from 'node:crypto';

// This module is deliberately an application boundary, not an HTTP route or a
// Firestore client. A production host must inject a verified session resolver,
// action authorizer, and the one-purpose append-only writer.
export const TRUSTED_AUDIT_SCHEMA_VERSION = '1';
export const TRUSTED_AUDIT_PRODUCT = 'smart_hsr_lands';
export const TRUSTED_AUDIT_ROLES = Object.freeze([
  'municipal_manager',
  'lands_department_manager',
  'lands_employee'
]);
export const TRUSTED_AUDIT_STATUSES = Object.freeze(['draft', 'under_review', 'incomplete', 'approved', 'rejected', 'enabled', 'disabled']);
export const TRUSTED_AUDIT_REASON_CODES = Object.freeze(['workflow_review', 'document_replacement', 'document_removal', 'entitlement_change', 'role_change']);

const MANAGERS = Object.freeze(['municipal_manager', 'lands_department_manager']);
const DOCUMENT_MIME_TYPES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png']);
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SAFE_FIELD_NAME = /^[a-z][a-z0-9_]{0,47}$/;
const FORBIDDEN_FIELD_NAME = /^(national_id|civil_id|beneficiary|beneficiary_name|name|email|access_token|id_token|token|credential|secret|document_content|document_body|file_bytes|raw_request|raw_user)$/i;

function action(domain, roles) {
  return Object.freeze({ domain, roles: Object.freeze(roles) });
}

function domainActions(prefix, domain) {
  return {
    [`${prefix}.created`]: action(domain, TRUSTED_AUDIT_ROLES),
    [`${prefix}.updated`]: action(domain, MANAGERS),
    [`${prefix}.deleted`]: action(domain, ['municipal_manager'])
  };
}

// The action name and domain are both fixed. This prevents a caller from using
// the audit boundary as a generic Firestore-path or collection API.
export const TRUSTED_AUDIT_ACTIONS = Object.freeze({
  'lands.access_granted': action('authorization', TRUSTED_AUDIT_ROLES),
  'lands.entitlement_enabled': action('userAccess', ['municipal_manager']),
  'lands.entitlement_disabled': action('userAccess', ['municipal_manager']),
  'lands.role_changed': action('userAccess', ['municipal_manager']),
  'land_grant.created': action('landGrants', TRUSTED_AUDIT_ROLES),
  'land_grant.updated': action('landGrants', TRUSTED_AUDIT_ROLES),
  // Gate 3: submit (draft->under_review) / resubmit (incomplete->under_review)
  // are creator actions, open to any real Lands role — the actual security
  // boundary is server/lands-authorization.js's authorizeMutation(), which
  // independently requires record.created_by === actor_uid for this specific
  // operation, so an employee still can never transition someone else's grant.
  'land_grant.workflow_transitioned': action('landGrants', TRUSTED_AUDIT_ROLES),
  'land_grant.approved': action('landGrants', MANAGERS),
  'land_grant.rejected': action('landGrants', MANAGERS),
  // Reviewer-only: returns an under_review grant to its creator with a
  // mandatory reason. Same role gate as approve/reject — a manager or
  // department manager, never a plain employee.
  'land_grant.returned_for_completion': action('landGrants', MANAGERS),
  // Post-approval controlled reopen. Same reviewer-only role gate as
  // approve/reject/return_for_completion — never a plain employee, and
  // never restricted to the grant's own creator (a reviewer action over
  // any grant in the tenant).
  'land_grant.reopened': action('landGrants', MANAGERS),
  'land_grant.deleted': action('landGrants', ['municipal_manager']),
  // Soft archive — a reversible status flip, distinct from land_grant.deleted
  // (a real Firestore delete). Same role gate as approve/reject: a manager
  // or department manager, never a plain employee.
  'land_grant.archived': action('landGrants', MANAGERS),
  ...domainActions('royal_order', 'royalOrders'),
  ...domainActions('allocation_decision', 'allocationDecisions'),
  // Soft archive for a Decision — same reasoning as land_grant.archived
  // above: reversible, manager-gated, distinct from allocation_decision.deleted.
  'allocation_decision.archived': action('allocationDecisions', MANAGERS),
  ...domainActions('beneficiary', 'beneficiaries'),
  ...domainActions('plan', 'plans'),
  ...domainActions('parcel', 'parcels'),
  'document.uploaded': action('documents', TRUSTED_AUDIT_ROLES),
  'document.replaced': action('documents', MANAGERS),
  'document.deleted': action('documents', ['municipal_manager'])
});

export class TrustedAuditError extends Error {
  constructor(code) {
    super(code);
    this.name = 'TrustedAuditError';
    this.code = code;
  }
}

function fail(code) {
  throw new TrustedAuditError(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function assertOnlyKeys(value, keys, code) {
  if (!isPlainObject(value) || Object.keys(value).some((key) => !keys.includes(key))) fail(code);
}

function assertSafeId(value, code) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(code);
  return value;
}

function assertSafeRequestId(value) {
  if (typeof value !== 'string' || !SAFE_REQUEST_ID.test(value)) fail('INVALID_AUDIT_REQUEST_ID');
  return value;
}

function assertSafeFieldName(value) {
  if (typeof value !== 'string' || !SAFE_FIELD_NAME.test(value)) fail('UNSAFE_AUDIT_METADATA');
  if (FORBIDDEN_FIELD_NAME.test(value)) fail('PII_METADATA_DENIED');
  return value;
}

function normalizeSafeMetadata(value) {
  if (value === undefined) return Object.freeze({});
  if (isPlainObject(value) && Object.keys(value).some((key) => FORBIDDEN_FIELD_NAME.test(key))) fail('PII_METADATA_DENIED');
  assertOnlyKeys(value, ['previous_status', 'new_status', 'document_mime_type', 'reason_code', 'changed_fields', 'source'], 'UNSAFE_AUDIT_METADATA');
  const normalized = {};

  for (const [key, entry] of Object.entries(value)) {
    if (key === 'previous_status' || key === 'new_status') {
      if (!TRUSTED_AUDIT_STATUSES.includes(entry)) fail('UNSAFE_AUDIT_METADATA');
      normalized[key] = entry;
    } else if (key === 'document_mime_type') {
      if (!DOCUMENT_MIME_TYPES.includes(entry)) fail('UNSAFE_AUDIT_METADATA');
      normalized[key] = entry;
    } else if (key === 'reason_code') {
      if (!TRUSTED_AUDIT_REASON_CODES.includes(entry)) fail('UNSAFE_AUDIT_METADATA');
      normalized[key] = entry;
    } else if (key === 'changed_fields') {
      if (!Array.isArray(entry) || entry.length < 1 || entry.length > 12) fail('UNSAFE_AUDIT_METADATA');
      normalized[key] = Object.freeze(entry.map(assertSafeFieldName));
    } else if (key === 'source') {
      if (entry !== 'web') fail('UNSAFE_AUDIT_METADATA');
      normalized[key] = entry;
    }
  }

  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > 512) fail('AUDIT_METADATA_TOO_LARGE');
  return Object.freeze(normalized);
}

function normalizeCommand(command, requestIdFactory) {
  assertOnlyKeys(command, ['action', 'domain', 'record_id', 'request_id', 'safe_metadata'], 'UNTRUSTED_AUDIT_FIELD');
  if (typeof command.action !== 'string' || typeof command.domain !== 'string') fail('INVALID_AUDIT_ACTION');
  const definition = TRUSTED_AUDIT_ACTIONS[command.action];
  if (!definition) fail('UNSUPPORTED_AUDIT_ACTION');
  if (command.domain !== definition.domain) fail('UNSUPPORTED_AUDIT_DOMAIN');

  return Object.freeze({
    action: command.action,
    domain: command.domain,
    record_id: assertSafeId(command.record_id, 'INVALID_AUDIT_RECORD_ID'),
    request_id: command.request_id === undefined ? assertSafeRequestId(requestIdFactory()) : assertSafeRequestId(command.request_id),
    safe_metadata: normalizeSafeMetadata(command.safe_metadata)
  });
}

function normalizeVerifiedContext(value) {
  if (!isPlainObject(value) || value.lands_entitled !== true || value.membership_enabled !== true) fail('LANDS_ACCESS_DENIED');
  const actor_uid = assertSafeId(value.actor_uid, 'INVALID_VERIFIED_ACTOR');
  const municipality_id = assertSafeId(value.municipality_id, 'INVALID_VERIFIED_MUNICIPALITY');
  if (!TRUSTED_AUDIT_ROLES.includes(value.lands_role)) fail('INVALID_VERIFIED_ROLE');
  return Object.freeze({ actor_uid, municipality_id, lands_role: value.lands_role });
}

function serverTimestamp(now) {
  const date = now();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) fail('INVALID_TRUSTED_CLOCK');
  return date.toISOString();
}

function eventId(context, command) {
  const material = [
    TRUSTED_AUDIT_SCHEMA_VERSION,
    TRUSTED_AUDIT_PRODUCT,
    context.actor_uid,
    context.municipality_id,
    command.action,
    command.domain,
    command.record_id,
    command.request_id
  ].join('\n');
  return `lands_${createHash('sha256').update(material).digest('hex').slice(0, 40)}`;
}

export function isTrustedAuditActionRoleAllowed(role, actionName) {
  return Boolean(TRUSTED_AUDIT_ACTIONS[actionName]?.roles.includes(role));
}

/**
 * Builds an immutable audit event from a verified context and a strict command.
 * Callers must authorize and append it through a dedicated trusted boundary.
 */
export function prepareTrustedAuditEvent({ verifiedContext, command, now = () => new Date(), requestIdFactory = randomUUID }) {
  if (typeof now !== 'function' || typeof requestIdFactory !== 'function') throw new TypeError('TRUSTED_AUDIT_DEPENDENCY_REQUIRED');
  const context = normalizeVerifiedContext(verifiedContext);
  const normalized = normalizeCommand(command, requestIdFactory);
  if (!isTrustedAuditActionRoleAllowed(context.lands_role, normalized.action)) fail('AUDIT_ROLE_ACTION_DENIED');

  return Object.freeze({
    context,
    command: normalized,
    event: Object.freeze({
      event_id: eventId(context, normalized),
      schema_version: TRUSTED_AUDIT_SCHEMA_VERSION,
      occurred_at: serverTimestamp(now),
      actor_uid: context.actor_uid,
      actor_role: context.lands_role,
      municipality_id: context.municipality_id,
      product: TRUSTED_AUDIT_PRODUCT,
      action: normalized.action,
      domain: normalized.domain,
      record_id: normalized.record_id,
      result: 'success',
      request_id: normalized.request_id,
      safe_metadata: normalized.safe_metadata
    })
  });
}

/**
 * Creates a narrow trusted-ingestion boundary. Its dependencies are deliberately
 * required: there is no default HTTP, Firebase Admin, or generic database path.
 */
export function createTrustedAuditIngestor({ verifyRequest, authorizeAction, appendEvent, now = () => new Date(), requestIdFactory = randomUUID }) {
  if (typeof verifyRequest !== 'function' || typeof authorizeAction !== 'function' || typeof appendEvent !== 'function' || typeof now !== 'function' || typeof requestIdFactory !== 'function') {
    throw new TypeError('TRUSTED_AUDIT_DEPENDENCY_REQUIRED');
  }

  return Object.freeze({
    async ingest({ request, command }) {
      // Identity, entitlement, membership, municipality, and role originate
      // exclusively from the injected trusted verifier, never from command.
      const prepared = prepareTrustedAuditEvent({ verifiedContext: await verifyRequest(request), command, now, requestIdFactory });

      // The action service supplies record ownership / workflow authorization
      // from trusted state. An audit event cannot make an unauthorized action valid.
      if (await authorizeAction(prepared.context, prepared.command) !== true) fail('AUDIT_ACTION_NOT_AUTHORIZED');

      // appendEvent must be create-only and reject an existing event_id. This
      // module never exposes update/delete or a caller-controlled Firestore path.
      await appendEvent(prepared.event);
      return prepared.event;
    }
  });
}
