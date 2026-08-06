export const PREVIEW_ASSIGNMENT_FLAG = 'PLATFORM_ASSIGNMENT_V2';

export function isPreviewAssignmentV2Enabled({ override, hostname } = {}) {
  const host = String(hostname || '').toLowerCase();
  const safeHost = host === 'localhost' || host === '127.0.0.1' || host.startsWith('preview-');
  return override?.environment === 'preview'
    && override?.flags?.[PREVIEW_ASSIGNMENT_FLAG] === true
    && typeof override?.projectId === 'string'
    && override.projectId.startsWith('demo-')
    && safeHost;
}

export async function executeManagerAssignmentCallsite({ override, hostname, gateway, previewBootstrap, legacyWrite, input } = {}) {
  if (previewBootstrap) {
    if (override?.flags?.[PREVIEW_ASSIGNMENT_FLAG]!==true || override?.explicitOverride!==true) return legacyWrite(input);
    if (previewBootstrap.isAssignmentV2PreviewAvailable?.() !== true) return legacyWrite(input);
    gateway = previewBootstrap.getAssignmentV2PreviewApi?.();
    if (!gateway) return legacyWrite(input);
  }
  if (!isPreviewAssignmentV2Enabled({ override, hostname })) {
    if (!previewBootstrap) return legacyWrite(input);
  }
  if (!gateway || typeof gateway.createAssignment !== 'function' || typeof gateway.replaceAssignment !== 'function') {
    return { allowed: false, code: 'PREVIEW_V2_GATEWAY_REQUIRED', reason: 'Preview V2 gateway is not available.' };
  }
  const contractor = input?.contractor;
  if (!contractor || contractor.id !== input.contractorId || contractor.role !== 'contractor'
      || contractor.active === false || contractor.organizationId !== input?.actor?.organizationId) {
    return { allowed: false, code: 'PREVIEW_V2_CONTRACTOR_INVALID', reason: 'The selected contractor is not active in the actor organization.' };
  }
  const replacing = Boolean(input?.observation?.currentAssignmentId);
  const decision = replacing
    ? await gateway.replaceAssignment(input)
    : await gateway.createAssignment(input);
  return decision?.allowed === true ? decision : {
    allowed: false,
    code: decision?.code || 'PREVIEW_V2_ASSIGNMENT_DENIED',
    reason: decision?.reason || 'The V2 assignment request was denied.',
    auditEvent: decision?.auditEvent || null,
  };
}
