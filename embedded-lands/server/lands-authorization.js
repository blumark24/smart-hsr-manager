import { isTrustedAuditActionRoleAllowed } from './trusted-audit.js';

// Domains that carry a real Firestore record the trusted runtime can read to
// confirm same-tenant ownership before authorizing an action or mutation.
const RECORD_DOMAINS = ['userAccess', 'landGrants', 'royalOrders', 'allocationDecisions', 'beneficiaries', 'plans', 'parcels', 'documents'];

/**
 * Builds the trusted-audit `authorizeAction`/mutation `authorizeMutation`
 * dependencies from real Firestore reads. Role-vs-action gating is already
 * enforced upstream by the pure trusted-audit/trusted-lands-mutations
 * modules; this layer adds the tenant and record-relationship checks that
 * require trusted server-side state.
 */
export function createLandsAuthorizer({ db }) {
  async function fetchRecord(municipalityId, domain, recordId) {
    const snap = await db.doc(`landsMunicipalities/${municipalityId}/${domain}/${recordId}`).get();
    return snap.exists ? snap.data() : null;
  }

  return {
    async authorizeAction(context, command) {
      if (!isTrustedAuditActionRoleAllowed(context.lands_role, command.action)) return false;
      if (!RECORD_DOMAINS.includes(command.domain)) return false;
      if (command.action.endsWith('.created')) return true;
      const record = await fetchRecord(context.municipality_id, command.domain, command.record_id);
      if (!record || record.municipality_id !== context.municipality_id) return false;
      if (context.lands_role === 'lands_employee') return record.created_by === context.actor_uid;
      return true;
    },

    async authorizeMutation(context, mutationCommand) {
      const { audit_command: auditCommand } = mutationCommand;
      if (!isTrustedAuditActionRoleAllowed(context.lands_role, auditCommand.action)) return false;
      if (!RECORD_DOMAINS.includes(auditCommand.domain)) return false;

      // Entitlement changes target another user's membership record by uid;
      // a manager may never grant/alter/revoke their own entitlement here.
      if (auditCommand.domain === 'userAccess' && mutationCommand.record_id === context.actor_uid) return false;

      const record = await fetchRecord(context.municipality_id, auditCommand.domain, mutationCommand.record_id);
      if (!record) {
        // entitlement.enable is the only mutation allowed to target a
        // not-yet-existing membership record (a brand-new grant of access).
        return mutationCommand.operation === 'entitlement.enable';
      }
      if (record.municipality_id !== context.municipality_id) return false;
      // Gate 3: submit / resubmit (land_grant.transition) is a creator
      // action — the role allowlist above now permits any real Lands role,
      // so ownership is the actual boundary here: regardless of role, only
      // the grant's own author may advance it into review. This does NOT
      // apply to approve/reject/return_for_completion, which are reviewer
      // actions over any grant in the tenant (no ownership restriction).
      // Gate 3 P0 fix: land_grant.update (real content edits to a draft or
      // returned/incomplete grant) is the same kind of creator action — a
      // manager/reviewer must not gain arbitrary content-edit capability
      // merely because incomplete editing is now supported.
      if ((mutationCommand.operation === 'land_grant.transition' || mutationCommand.operation === 'land_grant.update') && record.created_by !== context.actor_uid) return false;
      return true;
    }
  };
}
