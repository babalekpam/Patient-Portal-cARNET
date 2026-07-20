// Realistic demo data for the NaviMED Patient Portal video recording.
// Dates are relative to 2026-07-20.

const profile = {
  firstName: "Sarah",
  lastName: "Mitchell",
  dateOfBirth: "1988-03-14",
  bloodType: "A+",
  phone: "(415) 555-0182",
  email: "sarah.mitchell@gmail.com",
  allergies: ["Penicillin", "Sulfa drugs"],
  gender: "Female",
  address: "2847 Maple Grove Ave, San Francisco, CA 94110",
  mrn: "MRN-2024-08471",
  emergencyContact: "James Mitchell (Husband)",
  emergencyPhone: "(415) 555-0147",
  insuranceProvider: "Blue Cross Blue Shield",
  insurancePolicyNumber: "BCBS-88274913",
};

const loginResponse = {
  token: "demo-session-token-9f83ab21",
  user: { id: "u_1042", email: profile.email, firstName: "Sarah", lastName: "Mitchell", role: "patient" },
  tenant: { id: "t_sfgh", name: "St. Francis General Hospital" },
};

const appointments = [
  {
    id: "apt-1",
    appointmentType: "Follow-up Visit",
    appointmentDate: "2026-07-24T10:30:00.000Z",
    status: "confirmed",
    reason: "Blood pressure follow-up",
    doctorName: "Dr. Emily Chen",
    provider: "Dr. Emily Chen",
    hospitalName: "St. Francis General Hospital",
    location: "Cardiology Clinic, 3rd Floor",
    duration: 30,
    notes: "Please bring your home blood pressure log.",
  },
  {
    id: "apt-2",
    appointmentType: "Annual Physical",
    appointmentDate: "2026-08-11T14:00:00.000Z",
    status: "scheduled",
    reason: "Annual wellness exam",
    doctorName: "Dr. Marcus Webb",
    provider: "Dr. Marcus Webb",
    hospitalName: "St. Francis General Hospital",
    location: "Primary Care, Suite 210",
    duration: 45,
  },
  {
    id: "apt-3",
    appointmentType: "Lab Work",
    appointmentDate: "2026-07-06T08:15:00.000Z",
    status: "completed",
    reason: "Fasting lipid panel and HbA1c",
    doctorName: "Dr. Emily Chen",
    provider: "Dr. Emily Chen",
    hospitalName: "St. Francis General Hospital",
    location: "Laboratory Services, 1st Floor",
    duration: 15,
  },
  {
    id: "apt-4",
    appointmentType: "Dermatology Consult",
    appointmentDate: "2026-06-18T11:00:00.000Z",
    status: "completed",
    reason: "Skin check",
    doctorName: "Dr. Priya Raman",
    provider: "Dr. Priya Raman",
    hospitalName: "St. Francis General Hospital",
    location: "Dermatology, Suite 405",
    duration: 30,
  },
];

const prescriptions = [
  {
    id: "rx-1",
    medicationName: "Lisinopril",
    dosage: "10 mg",
    frequency: "Once daily",
    prescribedDate: "2026-05-02",
    status: "active",
    refillsRemaining: 3,
    prescribingProvider: "Dr. Emily Chen",
    instructions: "Take one tablet by mouth every morning with or without food.",
  },
  {
    id: "rx-2",
    medicationName: "Metformin",
    dosage: "500 mg",
    frequency: "Twice daily",
    prescribedDate: "2026-05-02",
    status: "active",
    refillsRemaining: 2,
    prescribingProvider: "Dr. Emily Chen",
    instructions: "Take one tablet with breakfast and one with dinner.",
  },
  {
    id: "rx-3",
    medicationName: "Atorvastatin",
    dosage: "20 mg",
    frequency: "Once daily at bedtime",
    prescribedDate: "2026-03-15",
    status: "active",
    refillsRemaining: 1,
    prescribingProvider: "Dr. Marcus Webb",
    instructions: "Take one tablet at bedtime. Avoid grapefruit juice.",
  },
  {
    id: "rx-4",
    medicationName: "Amoxicillin",
    dosage: "500 mg",
    frequency: "Three times daily",
    prescribedDate: "2026-01-10",
    status: "completed",
    refillsRemaining: 0,
    prescribingProvider: "Dr. Priya Raman",
    instructions: "Completed 10-day course.",
  },
];

const labResults = [
  {
    id: "lab-1",
    testName: "Lipid Panel",
    resultDate: "2026-07-07",
    status: "final",
    category: "Chemistry",
    orderingProvider: "Dr. Emily Chen",
    results: [
      { name: "Total Cholesterol", value: "182", unit: "mg/dL", referenceRange: "< 200", flag: "normal" },
      { name: "LDL Cholesterol", value: "104", unit: "mg/dL", referenceRange: "< 100", flag: "high" },
      { name: "HDL Cholesterol", value: "58", unit: "mg/dL", referenceRange: "> 40", flag: "normal" },
      { name: "Triglycerides", value: "98", unit: "mg/dL", referenceRange: "< 150", flag: "normal" },
    ],
  },
  {
    id: "lab-2",
    testName: "Hemoglobin A1c",
    resultDate: "2026-07-07",
    status: "final",
    category: "Chemistry",
    orderingProvider: "Dr. Emily Chen",
    results: [
      { name: "HbA1c", value: "6.1", unit: "%", referenceRange: "4.0 - 5.6", flag: "high" },
    ],
  },
  {
    id: "lab-3",
    testName: "Complete Blood Count (CBC)",
    resultDate: "2026-07-07",
    status: "final",
    category: "Hematology",
    orderingProvider: "Dr. Emily Chen",
    results: [
      { name: "WBC", value: "6.8", unit: "K/uL", referenceRange: "4.5 - 11.0", flag: "normal" },
      { name: "RBC", value: "4.6", unit: "M/uL", referenceRange: "4.0 - 5.2", flag: "normal" },
      { name: "Hemoglobin", value: "13.9", unit: "g/dL", referenceRange: "12.0 - 15.5", flag: "normal" },
      { name: "Platelets", value: "255", unit: "K/uL", referenceRange: "150 - 400", flag: "normal" },
    ],
  },
];

const messages = [
  {
    id: "msg-1",
    type: "general_message",
    priority: "normal",
    originalContent: {
      subject: "Your recent lab results are in",
      message: "Hi Sarah, your lab results from July 7 are now available in your portal. Overall they look good — your A1c has improved since January. Let's discuss the LDL at your visit on July 24. — Dr. Chen",
    },
    createdAt: "2026-07-16T15:42:00.000Z",
    status: "unread",
    sender: "Dr. Emily Chen",
  },
  {
    id: "msg-2",
    type: "appointment_reminder",
    priority: "normal",
    originalContent: {
      subject: "Appointment reminder — July 24",
      message: "This is a reminder for your follow-up appointment with Dr. Emily Chen on Friday, July 24 at 10:30 AM in the Cardiology Clinic, 3rd Floor. Please remember to bring your home blood pressure log.",
    },
    createdAt: "2026-07-15T09:00:00.000Z",
    status: "read",
    sender: "St. Francis General Hospital",
  },
  {
    id: "msg-3",
    type: "general_message",
    priority: "normal",
    originalContent: {
      subject: "Prescription refill approved",
      message: "Your refill request for Lisinopril 10 mg has been approved and sent to Walgreens Pharmacy on Mission St. It should be ready for pickup after 2 PM today.",
    },
    createdAt: "2026-07-10T11:20:00.000Z",
    status: "read",
    sender: "Pharmacy Team",
  },
];

const visitSummaries = [
  {
    id: "vs-1",
    visitDate: "2026-07-06",
    visitType: "Office Visit",
    provider: "Emily Chen",
    doctorName: "Emily Chen",
    hospitalName: "St. Francis General Hospital",
    diagnosis: "Essential hypertension, well controlled; Prediabetes",
    summary: "Patient seen for routine hypertension follow-up. Home BP readings averaging 124/78. Medication regimen well tolerated with no side effects reported. Fasting labs ordered.",
    followUpDate: "2026-07-24",
    followUpInstructions: "Continue current medications. Return in 3 weeks to review lab results. Keep logging morning blood pressure.",
    vitals: { bloodPressure: "122/76", heartRate: "68 bpm", temperature: "98.4 °F", weight: "142 lb" },
    prescriptions: ["Lisinopril 10 mg daily", "Metformin 500 mg twice daily"],
    labOrders: ["Lipid Panel", "HbA1c", "CBC"],
    status: "finalized",
  },
  {
    id: "vs-2",
    visitDate: "2026-06-18",
    visitType: "Specialist Consult",
    provider: "Priya Raman",
    doctorName: "Priya Raman",
    hospitalName: "St. Francis General Hospital",
    diagnosis: "Benign nevus, no atypia",
    summary: "Full-body skin examination performed. One nevus on left shoulder photographed for monitoring. No suspicious lesions identified.",
    followUpInstructions: "Annual skin check recommended. Use SPF 30+ sunscreen daily.",
    vitals: { bloodPressure: "118/74", heartRate: "72 bpm" },
    status: "finalized",
  },
];

const bills = [
  {
    id: "bill-1",
    description: "Office Visit — Cardiology Follow-up",
    serviceDate: "2026-07-06",
    billDate: "2026-07-12",
    totalCharges: 285.0,
    insurancePaid: 228.0,
    patientResponsibility: 57.0,
    status: "due",
  },
  {
    id: "bill-2",
    description: "Laboratory Services — Lipid Panel, HbA1c, CBC",
    serviceDate: "2026-07-06",
    billDate: "2026-07-12",
    totalCharges: 164.5,
    insurancePaid: 148.05,
    patientResponsibility: 16.45,
    status: "due",
  },
  {
    id: "bill-3",
    description: "Dermatology Consult",
    serviceDate: "2026-06-18",
    billDate: "2026-06-25",
    totalCharges: 340.0,
    insurancePaid: 340.0,
    patientResponsibility: 0.0,
    status: "paid",
  },
];

const telehealthAppointments = [
  {
    id: "tele-1",
    appointmentDate: "2026-07-28T16:00:00.000Z",
    appointmentType: "Video Consultation",
    doctorName: "Dr. Marcus Webb",
    provider: "Dr. Marcus Webb",
    status: "scheduled",
    notes: "Medication review — join from a quiet, well-lit room.",
  },
];

module.exports = {
  profile,
  loginResponse,
  appointments,
  prescriptions,
  labResults,
  messages,
  visitSummaries,
  bills,
  telehealthAppointments,
};
