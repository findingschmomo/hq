import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding dashboard sample data…')

  // ─── Email Triage ──────────────────────────────────────────
  const emailCount = await prisma.emailItem.count()
  if (emailCount === 0) {
    await prisma.emailItem.createMany({
      data: [
        {
          subject: 'Board packet for September meeting',
          senderName: 'Board Secretary',
          category: 'board',
          priority: 'high',
          status: 'triage',
          summary: 'Requesting agenda items and the quarterly program report by Friday.',
          actionNote: 'Send program report + confirm agenda',
        },
        {
          subject: 'Grant report deadline — Philadelphia Youth Fund',
          senderName: 'Grants Office',
          senderEmail: 'grants@example.org',
          category: 'funder',
          priority: 'high',
          status: 'in_progress',
          summary: 'Final narrative and budget reconciliation due end of month.',
          actionNote: 'Draft narrative, pull enrollment numbers',
          assignedTo: 'Programs team',
        },
        {
          subject: 'Facilities: HVAC quote for community room',
          senderName: 'Buildings & Grounds',
          category: 'facilities',
          priority: 'medium',
          status: 'triage',
          summary: 'Two quotes received; needs review before board approval.',
        },
        {
          subject: 'Parent question about fall registration',
          senderName: 'Community member',
          category: 'resident',
          priority: 'low',
          status: 'done',
          summary: 'Answered with registration link and scholarship info.',
        },
      ],
    })
    console.log('  ✓ emails')
  }

  // ─── KPIs + readings ───────────────────────────────────────
  const kpiCount = await prisma.kpi.count()
  if (kpiCount === 0) {
    const kpis = await Promise.all([
      prisma.kpi.create({
        data: {
          name: 'Students served monthly',
          description: 'Unique students across all programs in a calendar month.',
          category: 'programs', unit: 'number', target: 350, frequency: 'monthly',
          owner: 'Programs Director',
        },
      }),
      prisma.kpi.create({
        data: {
          name: 'Average attendance rate',
          category: 'programs', unit: 'percent', target: 85, frequency: 'monthly',
          owner: 'Programs Director',
        },
      }),
      prisma.kpi.create({
        data: {
          name: 'Grant dollars secured (YTD)',
          category: 'fundraising', unit: 'currency', target: 1200000, frequency: 'quarterly',
          owner: 'Development lead',
        },
      }),
      prisma.kpi.create({
        data: {
          name: 'Staff retention rate',
          category: 'staff', unit: 'percent', target: 90, frequency: 'quarterly',
          owner: 'Operations',
        },
      }),
    ])

    const now = new Date()
    const monthsAgo = (n: number) => new Date(now.getFullYear(), now.getMonth() - n, 1)

    await prisma.kpiReading.createMany({
      data: [
        { kpiId: kpis[0].id, value: 298, periodStart: monthsAgo(2) },
        { kpiId: kpis[0].id, value: 322, periodStart: monthsAgo(1) },
        { kpiId: kpis[0].id, value: 341, periodStart: monthsAgo(0) },
        { kpiId: kpis[1].id, value: 78.4, periodStart: monthsAgo(2) },
        { kpiId: kpis[1].id, value: 80.1, periodStart: monthsAgo(1) },
        { kpiId: kpis[1].id, value: 83.6, periodStart: monthsAgo(0) },
        { kpiId: kpis[2].id, value: 745000, periodStart: monthsAgo(3), note: 'Q1 close' },
        { kpiId: kpis[2].id, value: 920000, periodStart: monthsAgo(0) },
        { kpiId: kpis[3].id, value: 86, periodStart: monthsAgo(0) },
      ],
    })
    console.log('  ✓ KPIs + readings')
  }

  // ─── Stakeholders + interactions ───────────────────────────
  const stakeholderCount = await prisma.stakeholder.count()
  if (stakeholderCount === 0) {
    const people = await Promise.all([
      prisma.stakeholder.create({
        data: {
          name: 'Maria Gonzalez', title: 'Board Chair', organization: 'Heights Philadelphia Board',
          type: 'board', importance: 'high', cadenceDays: 14,
          email: 'mgonzalez@example.org', notes: 'Prefers a quick Monday call. Focused on fundraising pipeline.',
        },
      }),
      prisma.stakeholder.create({
        data: {
          name: 'James Whitfield', title: 'Program Officer', organization: 'City Youth Foundation',
          type: 'funder', importance: 'high', cadenceDays: 30,
          email: 'jwhitfield@cyf.example.org', notes: 'Renewal decision in Q4. Wants impact story for newsletter.',
        },
      }),
      prisma.stakeholder.create({
        data: {
          name: 'Denise Carter', title: 'Principal', organization: 'Heights High School',
          type: 'partner', importance: 'normal', cadenceDays: 21,
          email: 'dcarter@hhs.example.org',
        },
      }),
      prisma.stakeholder.create({
        data: {
          name: 'Andre Brooks', title: 'Youth Programs Manager', organization: 'Heights Philadelphia',
          type: 'staff', importance: 'normal',
          email: 'abrooks@example.org',
        },
      }),
      prisma.stakeholder.create({
        data: {
          name: "Councilwoman O'Donnell", organization: 'Philadelphia City Council',
          type: 'government', importance: 'high', cadenceDays: 60,
          notes: 'Met at spring town hall. Interested in summer employment numbers.',
        },
      }),
    ])

    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

    await prisma.stakeholderInteraction.createMany({
      data: [
        {
          stakeholderId: people[1].id, channel: 'call', direction: 'outbound',
          summary: 'Check-in on grant deliverables; invited him to October showcase.',
          date: daysAgo(40),
          followUpNeeded: true, followUpDate: daysAgo(-5),
        },
        {
          stakeholderId: people[0].id, channel: 'meeting', direction: 'outbound',
          summary: 'Reviewed board retreat plan and committee assignments.',
          date: daysAgo(9), sentiment: 'positive',
        },
        {
          stakeholderId: people[2].id, channel: 'email', direction: 'inbound',
          summary: 'Asked about expanding after-school slots to 9th graders.',
          date: daysAgo(25),
          followUpNeeded: true, followUpDate: daysAgo(2),
        },
        {
          stakeholderId: people[3].id, channel: 'meeting', direction: 'outbound',
          summary: 'Weekly staff sync — hiring pipeline at 3 candidates.',
          date: daysAgo(3),
        },
      ],
    })
    console.log('  ✓ stakeholders + interactions')
  }

  // ─── Tasks ─────────────────────────────────────────────────
  const taskCount = await prisma.task.count()
  if (taskCount === 0) {
    await prisma.task.createMany({
      data: [
        { name: 'Approve Q4 program calendar', status: 'Not started', priority: 'High', category: 'Programs' },
        { name: 'Draft annual appeal letter', status: 'In progress', priority: 'High', category: 'Development' },
        { name: 'Review HVAC quotes with facilities committee', status: 'Approved', priority: 'Medium', category: 'Operations' },
        { name: 'Schedule staff appreciation lunch', status: 'Done', priority: 'Low', category: 'Culture' },
      ],
    })
    console.log('  ✓ tasks')
  }

  // ─── Ideas ─────────────────────────────────────────────────
  const ideaCount = await prisma.idea.count()
  if (ideaCount === 0) {
    await prisma.idea.createMany({
      data: [
        { title: 'Partner with local trade unions for senior apprenticeships', category: 'partnerships', type: 'program' },
        { title: 'Quarterly community listening session at the rec center', category: 'community', type: 'engagement' },
        { title: 'Alumni mentorship circle for college-bound seniors', category: 'programs', type: 'growth' },
      ],
    })
    console.log('  ✓ ideas')
  }

  console.log('✅ Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
