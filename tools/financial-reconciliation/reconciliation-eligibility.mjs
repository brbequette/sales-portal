import crypto from 'node:crypto';
export function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}
export function buildEligibleManifest({documents,forward,rollback}){
  const f=new Map(forward.map(x=>[`${x.type}:${x.zohoId}`,x])),r=new Map(rollback.map(x=>[`${x.type}:${x.zohoId}`,x]));
  const entries=documents.map(d=>{const key=`${d.type}:${d.id}`,status=d.status,p=f.get(key),b=r.get(key);const eligible=status==='ready'&&p&&b&&Array.isArray(p.customFields)&&p.customFields.length>0;return {type:d.type,documentIdHash:hash(d.id).slice(0,16),documentId:eligible?d.id:undefined,forwardPayload:eligible?p:undefined,rollbackPayload:eligible?b:undefined,forwardPayloadHash:eligible?hash(p):undefined,rollbackPayloadHash:eligible?hash(b):undefined,changedFieldCount:eligible?p.customFields.length:0,exclusionReason:eligible?null:(status!=='ready'?status:!p?'no-forward-payload':!b?'no-rollback-payload':'no-op')}});
  const eligible=entries.filter(x=>x.exclusionReason===null);return Object.freeze({version:1,eligible,reviewEntries:entries.map(({documentId,...x})=>x),manifestSha256:hash(eligible)});
}
