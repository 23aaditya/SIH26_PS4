import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedStaff } from "./seedStaff.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding AICTE SQLite database (Express backend)...");

  // Clear existing records safely
  await prisma.notification.deleteMany();
  await prisma.undertakingEvidence.deleteMany();
  await prisma.undertaking.deleteMany();
  await prisma.eVCExpert.deleteMany();
  await prisma.eVCVisit.deleteMany();
  await prisma.deficiencyRequest.deleteMany();
  await prisma.workflowTask.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.applicationDocument.deleteMany();
  await prisma.application.deleteMany();
  await prisma.workflowTransition.deleteMany();
  await prisma.workflowStage.deleteMany();
  await prisma.workflowDefinition.deleteMany();
  await prisma.user.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.region.deleteMany();

  // 1. Seed Regions
  const regions = [
    { id: "western", code: "WRO", name: "Western Region (Mumbai)" },
    { id: "northern", code: "NRO", name: "Northern Region (New Delhi)" },
    { id: "southern", code: "SRO", name: "Southern Region (Chennai)" },
    { id: "eastern", code: "ERO", name: "Eastern Region (Kolkata)" },
    { id: "south_west", code: "SWRO", name: "South-Western Region (Bengaluru)" },
  ];

  for (const r of regions) {
    await prisma.region.create({ data: r });
  }

  // 2. Seed Institutions
  const institutions = [
    {
      id: "inst-001",
      institutionName: "Pune Institute of Computer Technology",
      institutionCode: "1-482910381",
      regionId: "western",
      address: "Survey No. 27, Near Trimurti Chowk, Dhankawadi, Pune, Maharashtra",
      contactEmail: "principal@pict.edu",
    },
    {
      id: "inst-002",
      institutionName: "Delhi Technological University",
      institutionCode: "1-928374615",
      regionId: "northern",
      address: "Shahbad Daulatpur, Main Bawana Road, New Delhi, Delhi",
      contactEmail: "dean_academics@dtu.ac.in",
    },
    {
      id: "inst-003",
      institutionName: "College of Engineering, Guindy",
      institutionCode: "1-384910293",
      regionId: "southern",
      address: "12, Sardar Patel Road, Guindy, Chennai, Tamil Nadu",
      contactEmail: "approvals@ceg.annauniv.edu",
    },
    {
      id: "inst-004",
      institutionName: "Jadavpur University Faculty of Engineering",
      institutionCode: "1-748291044",
      regionId: "eastern",
      address: "188, Raja S.C. Mallick Road, Kolkata, West Bengal",
      contactEmail: "engg_dean@jadavpuruniversity.in",
    },
    {
      id: "inst-005",
      institutionName: "BMS College of Engineering",
      institutionCode: "1-593820194",
      regionId: "south_west",
      address: "Bull Temple Road, Basavanagudi, Bengaluru, Karnataka",
      contactEmail: "principal@bmsce.ac.in",
    },
  ];

  for (const inst of institutions) {
    await prisma.institution.create({ data: inst });
  }

  // 3. Seed Users with bcrypt
  const defaultPasswordHash = await bcrypt.hash("password123", 10);

  const users = [
    {
      id: "inst-user-1",
      name: "Dr. P. T. Kulkarni (Principal)",
      email: "principal@pict.edu",
      passwordHash: defaultPasswordHash,
      role: "institution",
      accountType: "institution",
      institutionId: "inst-001",
      regionId: "western",
      active: true,
    },
    {
      id: "inst-user-2",
      name: "Prof. S. Prateek (DTU Dean)",
      email: "dean_academics@dtu.ac.in",
      passwordHash: defaultPasswordHash,
      role: "institution",
      accountType: "institution",
      institutionId: "inst-002",
      regionId: "northern",
      active: true,
    },
    {
      id: "inst-user-3",
      name: "Dr. K. R. Meenakshi (Anna Univ)",
      email: "approvals@ceg.annauniv.edu",
      passwordHash: defaultPasswordHash,
      role: "institution",
      accountType: "institution",
      institutionId: "inst-003",
      regionId: "southern",
      active: true,
    },
    {
      id: "inst-user-4",
      name: "Prof. Arindam Das (Jadavpur)",
      email: "engg_dean@jadavpuruniversity.in",
      passwordHash: defaultPasswordHash,
      role: "institution",
      accountType: "institution",
      institutionId: "inst-004",
      regionId: "eastern",
      active: true,
    },
    {
      id: "inst-user-5",
      name: "Dr. Murali Krishna (BMSCE)",
      email: "principal@bmsce.ac.in",
      passwordHash: defaultPasswordHash,
      role: "institution",
      accountType: "institution",
      institutionId: "inst-005",
      regionId: "south_west",
      active: true,
    },
    {
      id: "aicte-ro-west",
      name: "Dr. S. K. Deshmukh (Regional Officer)",
      email: "ro.western@aicte-india.org",
      passwordHash: defaultPasswordHash,
      role: "regional_officer",
      accountType: "aicte",
      regionId: "western",
      active: true,
    },
    {
      id: "aicte-scrutiny-1",
      name: "Prof. Anjali Mathur (Scrutiny Member)",
      email: "scrutiny.member1@aicte-india.org",
      passwordHash: defaultPasswordHash,
      role: "scrutiny_committee",
      accountType: "aicte",
      regionId: "western",
      active: true,
    },
    {
      id: "aicte-evc-1",
      name: "Dr. B. K. Raman (EVC Coordinator)",
      email: "evc.head@aicte-india.org",
      passwordHash: defaultPasswordHash,
      role: "evc_coordinator",
      accountType: "aicte",
      regionId: "western",
      active: true,
    },
    {
      id: "aicte-bureau-1",
      name: "Shri Rajiv Ranjan, IAS (Bureau Officer)",
      email: "bureau.approvals@aicte-india.org",
      passwordHash: defaultPasswordHash,
      role: "bureau_officer",
      accountType: "aicte",
      regionId: "western",
      active: true,
    },
    {
      id: "aicte-authority-1",
      name: "Prof. T. G. Sitharam (Competent Authority)",
      email: "chairman@aicte-india.org",
      passwordHash: defaultPasswordHash,
      role: "competent_authority",
      accountType: "aicte",
      regionId: "northern",
      active: true,
    },
    {
      id: "aicte-admin-1",
      name: "System Administrator",
      email: "admin@aicte-india.org",
      passwordHash: defaultPasswordHash,
      role: "admin",
      accountType: "aicte",
      active: true,
    },
  ];

  for (const u of users) {
    await prisma.user.create({ data: u });
  }

  // 4. Seed Workflow Definitions
  const wfEoA = await prisma.workflowDefinition.create({
    data: {
      id: "wf-eoa",
      name: "Extension of Approval (EoA) Standard Workflow",
      applicationCategory: "extension_of_approval",
      active: true,
    },
  });

  const stages = [
    {
      workflowDefinitionId: wfEoA.id,
      stageKey: "scrutiny",
      stageName: "Regional Scrutiny",
      sequence: 1,
      responsibleRole: "scrutiny_committee",
      defaultDeadlineDays: 14,
      allowsReturn: true,
    },
    {
      workflowDefinitionId: wfEoA.id,
      stageKey: "evc",
      stageName: "Expert Visiting Committee",
      sequence: 2,
      responsibleRole: "evc_coordinator",
      defaultDeadlineDays: 21,
      allowsReturn: false,
    },
    {
      workflowDefinitionId: wfEoA.id,
      stageKey: "committee",
      stageName: "Regional Hearing Committee",
      sequence: 3,
      responsibleRole: "bureau_officer",
      defaultDeadlineDays: 10,
      allowsReturn: true,
    },
    {
      workflowDefinitionId: wfEoA.id,
      stageKey: "decision",
      stageName: "Executive Decision",
      sequence: 4,
      responsibleRole: "competent_authority",
      defaultDeadlineDays: 7,
      isFinal: true,
    },
  ];

  for (const s of stages) {
    await prisma.workflowStage.create({ data: s });
  }

  // 5. Seed Applications (Left clean for genuine user submissions)
  const applications = [];
  for (const app of applications) {
    await prisma.application.create({ data: app });
  }


  // Seed AICTE Staff Directory and roles/committees/permissions
  await seedStaff(prisma);

  // Seed AICTE Dynamic Application Types & Document Requirements
  const { seedApplicationTypes } = await import("./seedApplicationTypes.js");
  await seedApplicationTypes();

  console.log("Database seeded successfully with statutory AICTE records!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
