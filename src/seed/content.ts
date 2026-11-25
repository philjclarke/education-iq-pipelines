/**
 * Fictional organisations and source content for the prototype.
 * All schools, URNs, excerpts and figures are invented for demonstration.
 */
import type { InputRecord, InputTypeRef, Organisation, Sentiment, Theme, User } from '../domain/types'

export const USERS: User[] = [
  { id: 'u-priya', name: 'Priya Natarajan', role: 'data_scientist', initials: 'PN' },
  { id: 'u-tom', name: 'Tom Hargreaves', role: 'data_scientist', initials: 'TH' },
  { id: 'u-aisha', name: 'Aisha Bello', role: 'reviewer', initials: 'AB' },
  { id: 'u-gareth', name: 'Gareth Lewis', role: 'operations', initials: 'GL' },
  { id: 'system', name: 'Pipeline worker', role: 'operations', initials: 'SW' },
]

export const THEMES: Theme[] = [
  { id: 'th-careers', code: 'careers_provision', name: 'Careers provision', description: 'Careers education, information, advice and guidance, including employer encounters and destinations.' },
  { id: 'th-send', code: 'send', name: 'SEND', description: 'Provision for pupils with special educational needs and disabilities.' },
  { id: 'th-behaviour', code: 'behaviour', name: 'Behaviour and attitudes', description: 'Behaviour, attendance and attitudes to learning.' },
  { id: 'th-leadership', code: 'leadership', name: 'Leadership and governance', description: 'Leadership, management and governance.' },
  { id: 'th-curriculum', code: 'curriculum', name: 'Curriculum and outcomes', description: 'Curriculum design, delivery and pupil outcomes.' },
]

export const SENTIMENTS: Sentiment[] = [
  { id: 'se-strong', code: 'strong', label: 'Strong', rank: 5 },
  { id: 'se-good', code: 'good', label: 'Good', rank: 4 },
  { id: 'se-mixed', code: 'mixed', label: 'Mixed', rank: 3 },
  { id: 'se-weak', code: 'weak', label: 'Weak', rank: 2 },
  { id: 'se-poor', code: 'poor', label: 'Poor', rank: 1 },
]

export const INPUT_TYPES: InputTypeRef[] = [
  { code: 'Ofsted', label: 'Ofsted report excerpts', source: 'Athena', description: 'Content snippets extracted from published Ofsted inspection reports.', dataType: 'excerpt_list' },
  { code: 'SchoolWebsite', label: 'School website text', source: 'Athena', description: 'Content snippets captured from the school’s own website.', dataType: 'excerpt_list' },
  { code: 'AuditorReport', label: 'Auditor report excerpts', source: 'Athena', description: 'Snippets from published auditor and annual reports.', dataType: 'excerpt_list' },
  { code: 'Atlas:Destinations', label: 'Atlas destination facts', source: 'Atlas', description: 'Facts from Atlas about pupil destinations after key stage 4 and 5.', dataType: 'fact_list' },
  { code: 'News', label: 'News articles', source: 'Loader', description: 'News articles matched to an organisation by the news loader.', dataType: 'excerpt_list' },
]

export const ORGS: Organisation[] = [
  { id: 'org-harbour', urn: '149210', name: 'Harbour View Academy', kind: 'school', phase: 'Secondary', localAuthority: 'Plymouth' },
  { id: 'org-millbrook', urn: '137845', name: 'Millbrook School', kind: 'school', phase: 'Secondary', localAuthority: 'Leicestershire' },
  { id: 'org-staidans', urn: '112503', name: 'St Aidan’s Church of England High School', kind: 'school', phase: 'Secondary', localAuthority: 'Cumberland' },
  { id: 'org-fenwick', urn: '121077', name: 'Fenwick Park Community School', kind: 'school', phase: 'Secondary', localAuthority: 'Norfolk' },
  { id: 'org-oakfield', urn: '140662', name: 'Oakfield Primary School', kind: 'school', phase: 'Primary', localAuthority: 'Warwickshire' },
  { id: 'org-riverside', urn: '151938', name: 'Riverside Studio School', kind: 'school', phase: 'Secondary (14–19)', localAuthority: 'Bristol' },
  { id: 'org-kingsmead', urn: '136120', name: 'Kingsmead Academy', kind: 'school', phase: 'Secondary', localAuthority: 'Hampshire' },
  { id: 'org-ashcombe', urn: '143377', name: 'Ashcombe Upper School', kind: 'school', phase: 'Secondary', localAuthority: 'Bedford' },
  { id: 'org-thornbury', urn: '145804', name: 'Thornbury Vale School', kind: 'school', phase: 'Secondary', localAuthority: 'South Gloucestershire' },
]

const L = '2026-10-02T06:15:00.000Z' // loader run date

function ofsted(id: string, orgId: string, date: string, title: string, content: string | null, extraction: InputRecord['extraction'] = 'ok'): InputRecord {
  return {
    id,
    orgId,
    typeRef: 'Ofsted',
    title,
    content,
    sourceUrl: `https://reports.ofsted.example/provider/23/${ORGS.find((o) => o.id === orgId)?.urn}`,
    publishedAt: date,
    loadedAt: L,
    extraction,
  }
}
function web(id: string, orgId: string, title: string, content: string, path: string): InputRecord {
  return { id, orgId, typeRef: 'SchoolWebsite', title, content, sourceUrl: `https://${orgId.replace('org-', '')}.school.example${path}`, publishedAt: '2026-09-01', loadedAt: L, extraction: 'ok' }
}
function fact(id: string, orgId: string, metric: string, value: string, period: string): InputRecord {
  return { id, orgId, typeRef: 'Atlas:Destinations', title: metric, content: `${value} (${period})`, metric, value, period, publishedAt: '2026-07-15', loadedAt: L, extraction: 'ok' }
}
function news(id: string, orgId: string, date: string, title: string, content: string): InputRecord {
  return { id, orgId, typeRef: 'News', title, content, sourceUrl: `https://news.example/${id.toLowerCase()}`, publishedAt: date, loadedAt: L, extraction: 'ok' }
}

export const INPUT_RECORDS: InputRecord[] = [
  // ── Harbour View Academy: worked example, four excerpts ──
  ofsted('OFS-20411', 'org-harbour', '2025-03-12', 'Personal development: careers programme',
    'Leaders have designed a well-sequenced careers programme that begins in Year 7. Pupils learn about a wide range of careers, including those linked to the city’s marine and defence industries. They speak confidently about the options open to them after Year 11.'),
  ofsted('OFS-20412', 'org-harbour', '2025-03-12', 'Personal development: employer encounters',
    'Pupils meet employers and training providers regularly through assemblies, workshops and a careers fair. Most pupils in Year 10 complete a week of work experience. A small number of pupils with SEND do not yet benefit from encounters that are adapted to their needs.'),
  ofsted('OFS-20413', 'org-harbour', '2025-03-12', 'Personal development: guidance',
    'All pupils receive at least one impartial guidance interview with a qualified adviser before the end of Year 11. Pupils value this advice. The school meets the requirements of the provider access legislation.'),
  ofsted('OFS-20414', 'org-harbour', '2025-03-12', 'Leadership and management',
    'Leaders and governors have an accurate view of the school’s strengths. They have rightly prioritised improving the consistency of the careers offer for disadvantaged pupils and those with SEND.'),
  web('WEB-30120', 'org-harbour', 'Careers at Harbour View', 'Our careers leader works with the Careers Hub and local employers to provide encounters for every year group. Parents can book a guidance meeting at any time.', '/careers'),
  fact('ATL-40211', 'org-harbour', 'Sustained education or employment after KS4', '93%', '2023/24 leavers'),
  fact('ATL-40212', 'org-harbour', 'Apprenticeship destinations after KS4', '7%', '2023/24 leavers'),

  // ── Millbrook School: well supported, good ──
  ofsted('OFS-20531', 'org-millbrook', '2024-11-06', 'Personal development: careers',
    'The careers programme is a strength. Pupils receive clear information about academic and technical routes, including apprenticeships and T levels. Visits to local colleges and universities help pupils to raise their aspirations.'),
  ofsted('OFS-20532', 'org-millbrook', '2024-11-06', 'Sixth form: guidance',
    'Students in the sixth form receive effective support with applications to university and apprenticeships. They benefit from mock interviews with volunteers from local businesses.'),
  ofsted('OFS-20533', 'org-millbrook', '2024-11-06', 'Personal development: wider offer',
    'Pupils take part in a wide range of clubs and enrichment activities. Leaders track participation carefully and encourage disadvantaged pupils to take part.'),
  web('WEB-30144', 'org-millbrook', 'Careers and futures', 'Every pupil has a careers action plan, reviewed each year with their tutor.', '/futures'),
  fact('ATL-40231', 'org-millbrook', 'Sustained education or employment after KS4', '96%', '2023/24 leavers'),

  // ── St Aidan’s: well supported, strong ──
  ofsted('OFS-20601', 'org-staidans', '2025-06-18', 'Personal development: careers',
    'Careers education is exceptionally well planned. From Year 7, pupils learn about the world of work through the curriculum. Subject teachers routinely link learning to careers. Pupils meet employers from a wide range of sectors in every year.'),
  ofsted('OFS-20602', 'org-staidans', '2025-06-18', 'Personal development: guidance and destinations',
    'All pupils receive independent guidance and support to plan their next steps. Leaders check that every pupil has a suitable place in education, employment or training after Year 11 and follow up with those at risk.'),
  ofsted('OFS-20603', 'org-staidans', '2025-06-18', 'SEND',
    'Pupils with SEND are supported well. Careers advisers work closely with families of pupils with education, health and care plans to plan transitions.'),
  fact('ATL-40301', 'org-staidans', 'Sustained education or employment after KS4', '98%', '2023/24 leavers'),
  fact('ATL-40302', 'org-staidans', 'NEET after KS4', '1%', '2023/24 leavers'),

  // ── Fenwick Park: unsupported claim scenario ──
  ofsted('OFS-20711', 'org-fenwick', '2024-02-28', 'Personal development: careers',
    'Pupils receive some useful information about their next steps, but the careers programme is not well coordinated. Encounters with employers are infrequent in key stage 3.'),
  ofsted('OFS-20712', 'org-fenwick', '2024-02-28', 'Personal development: guidance',
    'Pupils in Year 11 have a guidance interview, but some pupils say this comes too late to inform their choices of qualifications in Year 9.'),
  ofsted('OFS-20713', 'org-fenwick', '2024-02-28', 'What does the school need to do to improve?',
    'Leaders should ensure that the careers programme provides pupils with regular, well-planned encounters with employers and timely guidance, so that all pupils are well informed about their options.'),
  web('WEB-30177', 'org-fenwick', 'Careers news', 'This term our Year 10 pupils visited the Norwich Research Park and took part in a STEM challenge day.', '/news/careers'),

  // ── Oakfield Primary: relevant evidence absent (pastoral only) ──
  ofsted('OFS-20801', 'org-oakfield', '2025-01-15', 'Behaviour and attitudes',
    'Pupils behave well in lessons and at social times. They are kind to one another and say that adults help them if they have worries.'),
  ofsted('OFS-20802', 'org-oakfield', '2025-01-15', 'Personal development: pastoral support',
    'The school’s pastoral team provides effective support for pupils and families who need it. Pupils learn how to keep themselves safe, including online.'),
  ofsted('OFS-20803', 'org-oakfield', '2025-01-15', 'Quality of education: reading',
    'Reading is a priority. Pupils in the early years and key stage 1 learn phonics systematically and read books that match the sounds they know.'),

  // ── Riverside Studio School: no Ofsted records yet (new school) ──
  web('WEB-30210', 'org-riverside', 'About our studio model', 'Students spend two days a week on placements with creative and digital employers across Bristol.', '/about'),

  // ── Kingsmead Academy: over-long first draft ──
  ofsted('OFS-20901', 'org-kingsmead', '2025-09-24', 'Personal development: careers',
    'Pupils benefit from a strong careers programme. They learn about local opportunities in aerospace, logistics and health. The school works effectively with the local Careers Hub.'),
  ofsted('OFS-20902', 'org-kingsmead', '2025-09-24', 'Personal development: guidance',
    'Pupils receive timely, impartial guidance. Leaders make sure that pupils hear about apprenticeships and technical routes as well as A levels.'),
  ofsted('OFS-20903', 'org-kingsmead', '2025-09-24', 'Areas for improvement',
    'Some pupils in Year 8 and Year 9 are not yet clear about how their subject choices relate to future careers.'),
  fact('ATL-40501', 'org-kingsmead', 'Sustained education or employment after KS4', '95%', '2023/24 leavers'),

  // ── Ashcombe Upper: provider error then recovery ──
  ofsted('OFS-21001', 'org-ashcombe', '2024-06-05', 'Personal development: careers',
    'Leaders have improved the careers programme since the previous inspection. Pupils now meet employers in each year group and receive guidance before making key stage 4 choices.'),
  ofsted('OFS-21002', 'org-ashcombe', '2024-06-05', 'Personal development: work experience',
    'Pupils in Year 12 complete work experience linked to their intended careers. Leaders are extending this to Year 10 from next year.'),
  fact('ATL-40601', 'org-ashcombe', 'Sustained education or employment after KS4', '91%', '2023/24 leavers'),

  // ── Thornbury Vale: malformed output; one unusable record ──
  ofsted('OFS-21101', 'org-thornbury', '2023-10-11', 'Personal development: careers',
    'The careers programme is well organised. Pupils are well informed about the range of options available after Year 11 and Year 13.'),
  ofsted('OFS-21102', 'org-thornbury', '2023-10-11', 'Personal development: employer links',
    'The school has developed strong links with local employers, who contribute to assemblies, mentoring and mock interviews.'),
  ofsted('OFS-21103', 'org-thornbury', '2023-10-11', 'Annex: inspection evidence (scanned)', null, 'failed'),

  // ── News (for news classification pipeline) ──
  news('NEWS-5101', 'org-harbour', '2026-10-14', 'Harbour View pupils win regional marine engineering challenge',
    'A team of Year 9 pupils from Harbour View Academy won a regional engineering challenge run with a Plymouth shipbuilder. The school said the event was part of its programme of employer encounters.'),
  news('NEWS-5102', 'org-fenwick', '2026-09-30', 'Fenwick Park consults on new leadership structure',
    'Governors at Fenwick Park Community School have opened a consultation on changes to the senior leadership team following the appointment of a new headteacher.'),
  news('NEWS-5103', 'org-kingsmead', '2026-11-03', 'Kingsmead Academy opens new aerospace skills centre',
    'Kingsmead Academy has opened a skills centre in partnership with local aerospace employers, giving sixth-form students access to industry-standard equipment.'),
  news('NEWS-5104', 'org-oakfield', '2026-10-21', 'Oakfield Primary celebrates reading milestone',
    'Pupils at Oakfield Primary School have read more than 10,000 books this term as part of the school’s reading challenge.'),
]

/** Scripted narrative used by the simulated provider for each organisation. */
export interface OrgNarrative {
  selectRefs: string[]
  summary: string
  summaryRefs: string[]
  sentiment: string
  /** Over-long first draft for the word-limit scenario. */
  longExtra?: string
}

export const NARRATIVES: Record<string, OrgNarrative> = {
  'org-harbour': {
    selectRefs: ['OFS-20411', 'OFS-20412', 'OFS-20413', 'OFS-20414'],
    summary:
      'Harbour View Academy has a well-sequenced careers programme from Year 7, with regular employer encounters linked to local marine and defence industries. Most Year 10 pupils complete work experience and all pupils receive an impartial guidance interview before the end of Year 11. Inspectors noted that some pupils with SEND do not yet receive adapted encounters, and leaders are prioritising consistency for disadvantaged pupils and those with SEND.',
    summaryRefs: ['OFS-20411', 'OFS-20412', 'OFS-20413', 'OFS-20414'],
    sentiment: 'good',
  },
  'org-millbrook': {
    selectRefs: ['OFS-20531', 'OFS-20532'],
    summary:
      'Inspectors describe careers provision at Millbrook School as a strength. Pupils receive clear information about academic and technical routes, including apprenticeships and T levels, and visits to colleges and universities raise aspirations. Sixth-form students are well supported with university and apprenticeship applications and take part in mock interviews with local businesses.',
    summaryRefs: ['OFS-20531', 'OFS-20532'],
    sentiment: 'good',
  },
  'org-staidans': {
    selectRefs: ['OFS-20601', 'OFS-20602', 'OFS-20603'],
    summary:
      'Careers education at St Aidan’s is exceptionally well planned, with careers linked to subject teaching from Year 7 and employer encounters in every year. All pupils receive independent guidance, and leaders check that each pupil has a suitable destination after Year 11. Careers advisers work closely with families of pupils with education, health and care plans to plan transitions.',
    summaryRefs: ['OFS-20601', 'OFS-20602', 'OFS-20603'],
    sentiment: 'strong',
  },
  'org-fenwick': {
    selectRefs: ['OFS-20711', 'OFS-20712', 'OFS-20713'],
    summary:
      'Careers provision at Fenwick Park is not well coordinated. Pupils receive some useful information, but employer encounters are infrequent in key stage 3 and some pupils say their Year 11 guidance interview comes too late to inform Year 9 choices. Inspectors asked leaders to provide regular, well-planned employer encounters and timely guidance.',
    summaryRefs: ['OFS-20711', 'OFS-20712', 'OFS-20713'],
    sentiment: 'weak',
  },
  'org-kingsmead': {
    selectRefs: ['OFS-20901', 'OFS-20902', 'OFS-20903'],
    summary:
      'Kingsmead Academy has a strong careers programme that introduces pupils to local opportunities in aerospace, logistics and health, working closely with the Careers Hub. Pupils receive timely, impartial guidance covering apprenticeships and technical routes as well as A levels. Some pupils in Years 8 and 9 are not yet clear how subject choices relate to future careers.',
    summaryRefs: ['OFS-20901', 'OFS-20902', 'OFS-20903'],
    sentiment: 'good',
    longExtra:
      ' In addition, the school benefits from a wide network of partners, and pupils clearly enjoy the many activities on offer throughout the year. Staff are enthusiastic about careers and are committed to continuing to develop the programme further so that every pupil, whatever their starting point, can achieve their ambitions and go on to succeed in later life.',
  },
  'org-ashcombe': {
    selectRefs: ['OFS-21001', 'OFS-21002'],
    summary:
      'Leaders at Ashcombe Upper School have improved careers provision since the previous inspection. Pupils now meet employers in every year group and receive guidance before choosing key stage 4 courses. Year 12 students complete work experience linked to their intended careers, and leaders are extending work experience to Year 10.',
    summaryRefs: ['OFS-21001', 'OFS-21002'],
    sentiment: 'good',
  },
  'org-thornbury': {
    selectRefs: ['OFS-21101', 'OFS-21102'],
    summary:
      'Thornbury Vale School has a well-organised careers programme. Pupils are well informed about options after Year 11 and Year 13, and strong links with local employers support assemblies, mentoring and mock interviews.',
    summaryRefs: ['OFS-21101', 'OFS-21102'],
    sentiment: 'good',
  },
}

export const NEWS_CLASSIFICATIONS: Record<string, { theme: string; sentiment: string; relevance: number; rationale: string }> = {
  'org-harbour': { theme: 'careers_provision', sentiment: 'strong', relevance: 0.9, rationale: 'Describes an employer-linked engineering challenge presented as part of the careers programme.' },
  'org-fenwick': { theme: 'leadership', sentiment: 'mixed', relevance: 0.8, rationale: 'Reports a consultation on leadership restructuring after a new headteacher appointment.' },
  'org-kingsmead': { theme: 'careers_provision', sentiment: 'strong', relevance: 0.85, rationale: 'New employer partnership giving sixth-form students industry equipment and skills.' },
  'org-oakfield': { theme: 'curriculum', sentiment: 'good', relevance: 0.7, rationale: 'Reading challenge milestone relates to curriculum and reading outcomes.' },
}
