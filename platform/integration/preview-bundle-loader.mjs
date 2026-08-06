const BUNDLE_PATH='/preview-only/assignment-v2-preview.bundle.js';

export async function maybeLoadAssignmentV2PreviewBundle({ win=globalThis.window, doc=globalThis.document }={}) {
  const request=win?.__SMART_HSR_PREVIEW_BUNDLE_REQUEST__;
  if (request?.enabled!==true) return {available:false,code:'PREVIEW_BUNDLE_NOT_REQUESTED'};
  if (!doc?.createElement || !doc?.head) return {available:false,code:'PREVIEW_DOCUMENT_REQUIRED'};
  try {
    if (!win.SmartHSRAssignmentV2PreviewBundle) await new Promise((resolve,reject)=>{const script=doc.createElement('script');script.src=BUNDLE_PATH;script.async=false;script.dataset.smartHsrPreview='assignment-v2';script.onload=resolve;script.onerror=()=>reject(new Error('Preview bundle load failed.'));doc.head.appendChild(script);});
    const bootstrap=win.SmartHSRAssignmentV2PreviewBundle,deps=win.__SMART_HSR_PREVIEW_FIREBASE__,config=win.__SMART_HSR_PREVIEW_ASSIGNMENT_V2__;
    if (!bootstrap || !deps || !config) return {available:false,code:'PREVIEW_BOOTSTRAP_INPUT_REQUIRED'};
    const status=bootstrap.initializeAssignmentV2Preview({environment:config.environment,explicitOverride:config.explicitOverride,featureEnabled:config.flags?.PLATFORM_ASSIGNMENT_V2===true,hostname:win.location?.hostname,projectId:deps.projectId,emulatorConnected:deps.emulatorConnected===true,app:deps.app,db:deps.db,sdk:deps.sdk,clock:deps.clock,idFactory:deps.idFactory});
    if (status.allowed!==true) return status;
    win.__SMART_HSR_ASSIGNMENT_V2_PREVIEW__=bootstrap;
    return status;
  } catch (error) {
    delete win.__SMART_HSR_ASSIGNMENT_V2_PREVIEW__;
    return {available:false,allowed:false,code:'PREVIEW_BUNDLE_LOAD_FAILED',reason:error?.message||'Preview bundle load failed.',environment:'preview'};
  }
}
