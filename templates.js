/** Starter templates, copied into a new user's own "Voice Notes data" spreadsheet the first time they sign in. Edit templates in that spreadsheet, not here. */
const STARTER_TEMPLATES = [
  {
    id: 'tha-posterior', name: 'Total hip arthroplasty (posterior)', noteType: 'op', active: 'yes',
    sections: 'Procedure; Indication; Surgeon / Assistant; Anaesthetic; Position and preparation; Approach; Findings; Procedure details; Implants; Closure; Post-operative instructions',
    defaults: [
      'Position and preparation: Lateral decubitus on positioner. Prophylactic IV antibiotics prior to incision. Skin prepared and draped in standard sterile fashion. Time out completed.',
      'Approach: Posterior approach. Short external rotators and posterior capsule released and tagged.',
      'Closure: Posterior capsule and short external rotators repaired. Fascia, subcutaneous tissue and skin closed in layers. Dressing applied.',
      'Post-operative instructions: WBAT. Hip precautions as per unit protocol. VTE prophylaxis as per unit protocol. Post-operative antibiotics as per protocol. Check X-ray. Physiotherapy. Clinic review at 6 weeks.',
    ].join('\n'),
    checks: 'Indication; Each component with size (stem, head, cup and liner); Cemented or uncemented; Stability assessment; Leg length assessment; Weight-bearing status; VTE plan; Follow-up interval',
  },
  {
    id: 'tka', name: 'Total knee arthroplasty', noteType: 'op', active: 'yes',
    sections: 'Procedure; Indication; Surgeon / Assistant; Anaesthetic; Position and preparation; Approach; Findings; Procedure details; Implants; Closure; Post-operative instructions',
    defaults: [
      'Position and preparation: Supine. Tourniquet applied to the thigh. Prophylactic IV antibiotics prior to inflation. Skin prepared and draped in standard sterile fashion. Time out completed.',
      'Approach: Midline skin incision, medial parapatellar arthrotomy.',
      'Closure: Arthrotomy closed. Subcutaneous tissue and skin closed in layers. Dressing applied.',
      'Post-operative instructions: WBAT, full range of motion as tolerated. VTE prophylaxis as per unit protocol. Post-operative antibiotics as per protocol. Check X-ray. Physiotherapy. Clinic review at 6 weeks.',
    ].join('\n'),
    checks: 'Indication; Each component with size (femur, tibia, insert, patella or not resurfaced); Cemented or uncemented; Alignment and balance; Tourniquet time; Weight-bearing status; VTE plan; Follow-up interval',
  },
  {
    id: 'hemi', name: 'Hemiarthroplasty (neck of femur fracture)', noteType: 'op', active: 'yes',
    sections: 'Procedure; Indication; Surgeon / Assistant; Anaesthetic; Position and preparation; Approach; Findings; Procedure details; Implants; Closure; Post-operative instructions',
    defaults: [
      'Position and preparation: Lateral decubitus. Prophylactic IV antibiotics prior to incision. Skin prepared and draped in standard sterile fashion. Time out completed.',
      'Closure: Capsule repaired where possible. Fascia, subcutaneous tissue and skin closed in layers. Dressing applied.',
      'Post-operative instructions: WBAT. VTE prophylaxis as per unit protocol. Post-operative antibiotics as per protocol. Check X-ray. Orthogeriatric co-management. Physiotherapy. Clinic review at 6 weeks.',
    ].join('\n'),
    checks: 'Fracture classification; Approach; Cemented or uncemented; Stem and head size; Stability assessment; Weight-bearing status; VTE plan; Follow-up interval',
  },
  {
    id: 'dhs', name: 'Dynamic hip screw', noteType: 'op', active: 'yes',
    sections: 'Procedure; Indication; Surgeon / Assistant; Anaesthetic; Position and reduction; Approach; Procedure details; Implants; Closure; Post-operative instructions',
    defaults: [
      'Position and reduction: Supine on traction table. Closed reduction under image intensifier, confirmed on AP and lateral views. Prophylactic IV antibiotics prior to incision. Skin prepared and draped in standard sterile fashion. Time out completed.',
      'Approach: Lateral approach to the proximal femur.',
      'Closure: Fascia, subcutaneous tissue and skin closed in layers. Dressing applied.',
      'Post-operative instructions: WBAT. VTE prophylaxis as per unit protocol. Check X-ray. Orthogeriatric co-management. Physiotherapy. Clinic review at 6 weeks with X-ray.',
    ].join('\n'),
    checks: 'Fracture classification; Quality of reduction; Lag screw length; Plate angle and number of holes; Cortical screws; Tip-apex distance if stated; Weight-bearing status; VTE plan; Follow-up interval',
  },
  {
    id: 'cmn', name: 'Cephalomedullary nail (proximal femur)', noteType: 'op', active: 'yes',
    sections: 'Procedure; Indication; Surgeon / Assistant; Anaesthetic; Position and reduction; Approach; Procedure details; Implants; Closure; Post-operative instructions',
    defaults: [
      'Position and reduction: Supine on traction table. Closed reduction under image intensifier, confirmed on AP and lateral views. Prophylactic IV antibiotics prior to incision. Skin prepared and draped in standard sterile fashion. Time out completed.',
      'Closure: Wounds closed in layers. Dressings applied.',
      'Post-operative instructions: WBAT. VTE prophylaxis as per unit protocol. Check X-ray. Orthogeriatric co-management. Physiotherapy. Clinic review at 6 weeks with X-ray.',
    ].join('\n'),
    checks: 'Fracture classification; Quality of reduction; Open or closed reduction; Nail length and diameter; Lag screw or blade length; Distal locking (static or dynamic, number of screws); Weight-bearing status; VTE plan; Follow-up interval',
  },
  {
    id: 'ankle-orif', name: 'ORIF ankle', noteType: 'op', active: 'yes',
    sections: 'Procedure; Indication; Surgeon / Assistant; Anaesthetic; Position and preparation; Approach; Findings; Reduction and fixation; Implants; Closure; Post-operative instructions',
    defaults: [
      'Position and preparation: Supine, thigh tourniquet. Prophylactic IV antibiotics prior to inflation. Skin prepared and draped in standard sterile fashion. Time out completed.',
      'Closure: Subcutaneous tissue and skin closed in layers. Dressing and backslab applied.',
      'Post-operative instructions: Elevate. VTE prophylaxis as per unit protocol. Check X-ray. Wound review at 2 weeks. Clinic review at 6 weeks with X-ray.',
    ].join('\n'),
    checks: 'Fracture classification (e.g. Weber); Approach(es); Fixation for each malleolus; Syndesmosis assessment and fixation if any; Tourniquet time; Weight-bearing status and immobilisation; VTE plan; Follow-up interval',
  },
  {
    id: 'clinic-new', name: 'Clinic: new patient', noteType: 'clinic', active: 'yes',
    sections: 'Reason for referral; History of presenting complaint; Past medical and surgical history; Medications; Allergies; Social history and function; Examination; Imaging; Impression; Plan',
    defaults: '',
    checks: 'Side; Allergies stated; Relevant comorbidities; Function or mobility; Examination findings; Imaging reviewed; Clear impression; Plan with follow-up or discharge; If surgery is planned, documentation that risks, benefits and alternatives were discussed',
  },
  {
    id: 'clinic-postop', name: 'Clinic: post-op review', noteType: 'clinic', active: 'yes',
    sections: 'Procedure and time since surgery; Progress; Wound; Examination; Imaging; Plan',
    defaults: '',
    checks: 'Procedure and side; Time since surgery; Wound status; Pain and function; Examination findings; Imaging reviewed if taken; Weight-bearing and activity plan; Physiotherapy; Follow-up interval or discharge',
  },
  {
    id: 'clinic-fracture', name: 'Clinic: fracture clinic', noteType: 'clinic', active: 'yes',
    sections: 'Injury and management to date; Progress; Examination; Imaging; Impression; Plan',
    defaults: '',
    checks: 'Injury and side; Time since injury; Neurovascular status; Imaging reviewed; Immobilisation; Weight-bearing status; Next imaging; Follow-up interval or discharge',
  },
  {
    id: 'op-other', name: 'Other (free dictation)', noteType: 'op', active: 'yes',
    sections: 'Free dictation: no fixed template. Organise the dictation under clear headings that suit the procedure, e.g. Procedure; Indication; Findings; Procedure details; Implants; Closure; Post-operative instructions. Use only headings the dictation gives content for.',
    defaults: '',
    checks: 'Procedure and side; Post-operative weight-bearing or activity instructions; VTE plan; Follow-up interval',
  },
  {
    id: 'clinic-other', name: 'Clinic: other (free dictation)', noteType: 'clinic', active: 'yes',
    sections: 'Free dictation: no fixed template. Organise the dictation under clear headings that suit the consultation, e.g. History; Examination; Imaging; Impression; Plan. Use only headings the dictation gives content for.',
    defaults: '',
    checks: 'Plan with follow-up or discharge',
  },
];
