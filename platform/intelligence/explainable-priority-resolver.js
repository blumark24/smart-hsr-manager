'use strict';

const SEVERITY_SCORE = Object.freeze({ LOW:20, MEDIUM:45, HIGH:70, CRITICAL:90, UNKNOWN:0 });

function resolveExplainablePriority({ severity='UNKNOWN', riskIndicators=[], trafficImpact='UNKNOWN', criticalInfrastructureImpact=false, confidence=0, imageQuality='UNUSABLE', multipleIssuesDetected=false, unclearEvidence=false }={}) {
  if (severity === 'UNKNOWN') return Object.freeze({ prioritySuggestion:'UNKNOWN', score:0, reasonsAr:Object.freeze(['نوع الملاحظة أو شدتها غير واضح ويتطلب مراجعة ميدانية.']), requiresHumanReview:true });
  let score=SEVERITY_SCORE[severity] ?? 0; const reasons=[];
  reasons.push(`مستوى الشدة ${severity} أسهم في تقدير الأولوية.`);
  if(riskIndicators.includes('PUBLIC_SAFETY')){score+=15;reasons.push('يوجد مؤشر محتمل على السلامة العامة.');}
  if(riskIndicators.includes('ELECTRICAL_HAZARD')){score+=15;reasons.push('يوجد خطر كهربائي محتمل يتطلب الحذر.');}
  if(trafficImpact==='HIGH'){score+=10;reasons.push('التأثير المحتمل على حركة المرور مرتفع.');}
  if(criticalInfrastructureImpact){score+=10;reasons.push('قد تتأثر بنية خدمية حرجة.');}
  if(multipleIssuesDetected){score+=8;reasons.push('تفاعل عدة ملاحظات قد يرفع الأثر التشغيلي.');}
  let requiresHumanReview=false;
  if(confidence<0.55){score-=15;requiresHumanReview=true;reasons.push('انخفاض الثقة يقلل يقين التوصية.');}
  if(['POOR','UNUSABLE'].includes(imageQuality)){score-=10;requiresHumanReview=true;reasons.push('جودة الصورة غير كافية للاعتماد دون مراجعة.');}
  if(unclearEvidence){requiresHumanReview=true;reasons.push('الدليل غير واضح ويستلزم تحققاً ميدانياً.');}
  score=Math.max(0,Math.min(100,Math.round(score)));
  const prioritySuggestion=score>=85?'URGENT':score>=60?'HIGH':score>=30?'NORMAL':'LOW';
  return Object.freeze({prioritySuggestion,score,reasonsAr:Object.freeze(reasons),requiresHumanReview});
}

module.exports=Object.freeze({SEVERITY_SCORE,resolveExplainablePriority});
