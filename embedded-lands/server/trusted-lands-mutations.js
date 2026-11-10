import { TrustedAuditError, prepareTrustedAuditEvent } from './trusted-audit.js';

const SAFE_OPERATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

function mutation(action, domain) {
  return Object.freeze({ action, domain });
}

// This is a closed operation catalogue, deliberately not a collection/path API.
// A runtime host must implement each operation with its own trusted state checks.
export const TRUSTED_LANDS_MUTATIONS = Object.freeze({
  'entitlement.enable': mutation('lands.entitlement_enabled', 'userAccess'),
  'entitlement.disable': mutation('lands.entitlement_disabled', 'userAccess'),
  'entitlement.change_role': mutation('lands.role_changed', 'userAccess'),
  'land_grant.transition': mutation('land_grant.workflow_transitioned', 'landGrants'),
  // Gate 3 P0 fix: real content edits to a draft OR returned (incomplete)
  // grant, routed through this same trusted pipeline (not a direct
  // client-SDK write) so the write and its Trusted Audit event commit
  // atomically — see server/lands-mutation-executor.js's case and
  // server/lands-authorization.js's ownership check for this operation.
  'land_grant.update': mutation('land_grant.updated', 'landGrants'),
  'land_grant.approve': mutation('land_grant.approved', 'landGrants'),
  'land_grant.reject': mutation('land_grant.rejected', 'landGrants'),
  'land_grant.return_for_completion': mutation('land_grant.returned_for_completion', 'landGrants'),
  // Gate 3 P1: post-approval controlled reopen — a reviewer/manager action,
  // never a creator action (no ownership restriction in
  // server/lands-authorization.js, same as approve/reject/return_for_completion).
  'land_grant.reopen': mutation('land_grant.reopened', 'landGrants'),
  'land_grant.delete': mutation('land_grant.deleted', 'landGrants'),
  'land_grant.archive': mutation('land_grant.archived', 'landGrants'),
  'royal_order.update': mutation('royal_order.updated', 'royalOrders'),
  'royal_order.delete': mutation('royal_order.deleted', 'royalOrders'),
  'allocation_decision.update': mutation('allocation_decision.updated', 'allocationDecisions'),
  'allocation_decision.delete': mutation('allocation_decision.deleted', 'allocationDecisions'),
  'allocation_decision.archive': mutation('allocation_decision.archived', 'allocationDecisions'),
  'beneficiary.update': mutation('beneficiary.updated', 'beneficiaries'),
  'beneficiary.delete': mutation('beneficiary.deleted', 'beneficiaries'),
  'plan.update': mutation('plan.updated', 'plans'),
  'plan.delete': mutation('plan.deleted', 'plans'),
  'parcel.update': mutation('parcel.updated', 'parcels'),
  'parcel.delete': mutation('parcel.deleted', 'parcels'),
  'document.replace': mutation('document.replaced', 'documents'),
  'document.delete': mutation('document.deleted', 'documents')
});

function fail(code) {
  throw new TrustedAuditError(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeMutationCommand(command) {
  const allowedKeys = ['operation', 'record_id', 'request_id', 'safe_metadata'];
  if (!isPlainObject(command) || Object.keys(command).some((key) => !allowedKeys.includes(key))) fail('UNTRUSTED_MUTATION_FIELD');
  if (typeof command.operation !== 'string') fail('INVALID_MUTATION_OPERATION');
  const definition = TRUSTED_LANDS_MUTATIONS[command.operation];
  if (!definition) fail('UNSUPPORTED_MUTATION_OPERATION');
  if (typeof command.record_id !== 'string' || !SAFE_OPERATION_ID.test(command.record_id)) fail('INVALID_MUTATION_RECORD_ID');

  return Object.freeze({
    operation: command.operation,
    record_id: command.record_id,
    audit_command: Object.freeze({
      action: definition.action,
      domain: definition.domain,
      record_id: command.record_id,
      request_id: command.request_id,
      safe_metadata: command.safe_metadata
    })
  });
}

/**
 * Local/server-side contract for consequential Lands mutations. The caller
 * cannot select a path, collection, actor, municipality, role, product, or
 * timestamp. `commitMutationAndAudit` must atomically commit the fixed business
 * mutation and fixed audit append (for Firestore, one transaction).
 */
export function createTrustedLandsMutationService({ verifyRequest, authorizeMutation, commitMutationAndAudit, now = () => new Date(), requestIdFactory }) {
  if (typeof verifyRequest !== 'function' || typeof authorizeMutation !== 'function' || typeof commitMutationAndAudit !== 'function') {
    throw new TypeError('TRUSTED_MUTATION_DEPENDENCY_REQUIRED');
  }

  return Object.freeze({
    async mutate({ request, command }) {
      const mutationCommand = normalizeMutationCommand(command);
      const prepared = prepareTrustedAuditEvent({
        verifiedContext: await verifyRequest(request),
        command: mutationCommand.audit_command,
        now,
        ...(requestIdFactory === undefined ? {} : { requestIdFactory })
      });

      // Authorization occurs before any mutation/audit transaction starts.
      if (await authorizeMutation(prepared.context, mutationCommand) !== true) fail('MUTATION_NOT_AUTHORIZED');

      // The host receives only trusted context, fixed operation metadata, and a
      // fully derived event. It must not expose these as a generic CRUD API.
      const result = await commitMutationAndAudit(prepared.context, mutationCommand, prepared.event);
      return Object.freeze({ result, event: prepared.event });
    }
  });
}
