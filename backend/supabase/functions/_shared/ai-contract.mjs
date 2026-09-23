export const AI_CONTRACT_VERSION='swasthyasetu-ai-v1';
// Metadata is a contract, not a claim that every role has an implemented copilot.
export const AI_WORKFLOWS=Object.freeze({
 PATIENT_HEALTH:{roles:['PATIENT'],available:true,tools:['authorized_patient_context']},
 DOCTOR_CLINICAL:{roles:['DOCTOR'],available:true,tools:['authorized_patient_context']},
 HOSPITAL_OPERATIONS:{roles:['FACILITY'],available:false,tools:[]},
 LAB_DIAGNOSTIC:{roles:['LAB'],available:false,tools:[]},
 PHARMACY_OPERATIONS:{roles:['PHARMACY'],available:false,tools:[]},
 WORKER_FIELD:{roles:['WORKER'],available:false,tools:[]},
 ADMIN_GOVERNANCE:{roles:['ADMIN'],available:false,tools:[]},
});
export function normalizeWorkflow(workflow,role){
 let canonical=workflow;
 if(workflow==='CARE_HISTORY')canonical=role==='PATIENT'?'PATIENT_HEALTH':'DOCTOR_CLINICAL';
 if(['CONSULTATION','ENCOUNTER'].includes(workflow))canonical='DOCTOR_CLINICAL';
 if(workflow==='PATIENT_HOME')canonical='PATIENT_HEALTH';
 const entry=AI_WORKFLOWS[canonical];
 if(!entry)throw Error('INVALID_AI_REQUEST');
 if(!entry.roles.includes(role))throw Error('AI_WORKFLOW_NOT_AUTHORIZED');
 if(!entry.available)throw Error('AI_WORKFLOW_UNAVAILABLE');
 return canonical;
}
export function isKnownWorkflow(workflow){return Object.hasOwn(AI_WORKFLOWS,workflow)||['CARE_HISTORY','ENCOUNTER','CONSULTATION','PATIENT_HOME'].includes(workflow)}
