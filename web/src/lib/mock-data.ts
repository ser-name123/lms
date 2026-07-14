/* Static fixtures standing in for the API until the NestJS backend exists.
   Shapes here are the contract the real endpoints should return. */

export type Trend = { label: string; value: number };

export type Kpi = {
  id: string;
  label: string;
  value: string;
  raw: number;
  delta: number; // percent vs previous period
  hint: string;
  spark: Trend[];
};

const spark = (seed: number[]): Trend[] =>
  seed.map((value, i) => ({ label: `w${i + 1}`, value }));

export const kpis: Kpi[] = [
  {
    id: "students",
    label: "TOTAL STUDENTS",
    value: "3280",
    raw: 3280,
    delta: 12.4,
    hint: "vs last month",
    spark: spark([2210, 2290, 2340, 2455, 2510, 2640, 2712, 3280]),
  },
  {
    id: "classes",
    label: "NEW STUDENTS",
    value: "245",
    raw: 245,
    delta: -3.2,
    hint: "vs last week",
    spark: spark([1310, 1288, 1301, 1276, 1290, 1262, 1255, 245]),
  },
  {
    id: "completion",
    label: "TOTAL COURSE",
    value: "28",
    raw: 28,
    delta: 4.3,
    hint: "vs last month",
    spark: spark([79, 80, 82, 83, 84, 85, 86, 28]),
  },
  {
    id: "revenue",
    label: "FEES COLLECTION",
    value: "25160$",
    raw: 25160,
    delta: 8.1,
    hint: "vs last month",
    spark: spark([104, 112, 118, 121, 129, 133, 141, 148]),
  },
];

/* Revenue vs target — one axis, both measures in dollars (never a dual axis). */
export const revenueSeries = [
  { month: "Jan", revenue: 92000, target: 90000 },
  { month: "Feb", revenue: 98500, target: 95000 },
  { month: "Mar", revenue: 105200, target: 100000 },
  { month: "Apr", revenue: 101800, target: 105000 },
  { month: "May", revenue: 118400, target: 110000 },
  { month: "Jun", revenue: 124900, target: 115000 },
  { month: "Jul", revenue: 121300, target: 120000 },
  { month: "Aug", revenue: 133700, target: 125000 },
  { month: "Sep", revenue: 129500, target: 130000 },
  { month: "Oct", revenue: 141200, target: 135000 },
  { month: "Nov", revenue: 145800, target: 140000 },
  { month: "Dec", revenue: 148290, target: 145000 },
];

export const enrollmentSeries = [
  { month: "Jul", new: 210, churned: 42 },
  { month: "Aug", new: 264, churned: 38 },
  { month: "Sep", new: 238, churned: 55 },
  { month: "Oct", new: 312, churned: 47 },
  { month: "Nov", new: 289, churned: 36 },
  { month: "Dec", new: 341, churned: 44 },
];

export const courseMix = [
  { name: "Quran", value: 1284 },
  { name: "Tajweed", value: 762 },
  { name: "Arabic", value: 519 },
  { name: "Islamic Studies", value: 282 },
];

export type Enrollment = {
  id: string;
  student: string;
  email: string;
  course: string;
  teacher: string;
  status: "Active" | "Trial" | "Pending" | "Paused";
  progress: number;
  joined: string;
};

export const recentEnrollments: Enrollment[] = [
  { id: "ST-2841", student: "Ayesha Khan", email: "ayesha.k@mail.com", course: "Quran — Level 3", teacher: "Ustadh Bilal", status: "Active", progress: 72, joined: "2 Jul 2026" },
  { id: "ST-2840", student: "Omar Farooq", email: "omar.f@mail.com", course: "Tajweed — Level 1", teacher: "Ustadha Maryam", status: "Trial", progress: 18, joined: "2 Jul 2026" },
  { id: "ST-2839", student: "Fatima Noor", email: "fatima.n@mail.com", course: "Arabic — Level 2", teacher: "Ustadh Yusuf", status: "Active", progress: 45, joined: "1 Jul 2026" },
  { id: "ST-2838", student: "Hassan Ali", email: "hassan.a@mail.com", course: "Quran — Level 1", teacher: "Ustadha Zainab", status: "Pending", progress: 0, joined: "1 Jul 2026" },
  { id: "ST-2837", student: "Zara Ahmed", email: "zara.a@mail.com", course: "Islamic Studies", teacher: "Ustadh Bilal", status: "Active", progress: 91, joined: "30 Jun 2026" },
  { id: "ST-2836", student: "Ibrahim Sheikh", email: "ibrahim.s@mail.com", course: "Tajweed — Level 2", teacher: "Ustadha Maryam", status: "Paused", progress: 34, joined: "29 Jun 2026" },
];

export type ClassRow = {
  id: string;
  course: string;
  teacher: string;
  time: string;
  students: number;
  status: "Live" | "Upcoming" | "Done";
};

export const upcomingClasses: ClassRow[] = [
  { id: "CL-118", course: "Quran — Level 3", teacher: "Ustadh Bilal", time: "09:00", students: 12, status: "Live" },
  { id: "CL-119", course: "Tajweed — Level 1", teacher: "Ustadha Maryam", time: "10:30", students: 8, status: "Upcoming" },
  { id: "CL-120", course: "Arabic — Level 2", teacher: "Ustadh Yusuf", time: "12:00", students: 15, status: "Upcoming" },
  { id: "CL-121", course: "Quran — Level 1", teacher: "Ustadha Zainab", time: "14:15", students: 10, status: "Upcoming" },
  { id: "CL-117", course: "Islamic Studies", teacher: "Ustadh Bilal", time: "08:00", students: 9, status: "Done" },
];

/* Wider set for the students table — search, filter and pagination read this. */
const NAMES = [
  "Ayesha Khan", "Omar Farooq", "Fatima Noor", "Hassan Ali", "Zara Ahmed",
  "Ibrahim Sheikh", "Maryam Siddiqui", "Yusuf Rahman", "Aisha Malik", "Bilal Chaudhry",
  "Khadija Iqbal", "Zaid Ansari", "Sumaya Haque", "Tariq Mahmood", "Noor Fatima",
  "Adnan Qureshi", "Layla Hussain", "Imran Baig", "Sana Javed", "Rayyan Aziz",
  "Hafsa Riaz", "Danish Kamal", "Amina Yusuf", "Salman Tariq",
];
const COURSES = ["Quran — Level 1", "Quran — Level 3", "Tajweed — Level 1", "Tajweed — Level 2", "Arabic — Level 2", "Islamic Studies"];
const TEACHERS = ["Ustadh Bilal", "Ustadha Maryam", "Ustadh Yusuf", "Ustadha Zainab"];
const STATUSES: Enrollment["status"][] = ["Active", "Active", "Active", "Trial", "Pending", "Paused"];
const COUNTRIES = ["United Kingdom", "United States", "Canada", "UAE", "Australia", "Germany"];

export type Student = Enrollment & { country: string };

export const students: Student[] = NAMES.map((student, i) => ({
  id: `ST-${2841 - i}`,
  student,
  email: `${student.toLowerCase().split(" ")[0]}.${student.toLowerCase().split(" ")[1][0]}@mail.com`,
  course: COURSES[i % COURSES.length],
  teacher: TEACHERS[i % TEACHERS.length],
  status: STATUSES[i % STATUSES.length],
  progress: [72, 18, 45, 0, 91, 34, 58, 66, 12, 80, 27, 95][i % 12],
  joined: `${(i % 28) + 1} Jun 2026`,
  country: COUNTRIES[i % COUNTRIES.length],
}));

export type Activity = {
  id: string;
  who: string;
  action: string;
  target: string;
  at: string;
  kind: "payment" | "enroll" | "class" | "alert";
};

export const activity: Activity[] = [
  { id: "a1", who: "Ayesha Khan", action: "paid invoice", target: "INV-9021 · $180", at: "6m ago", kind: "payment" },
  { id: "a2", who: "Omar Farooq", action: "booked a trial for", target: "Tajweed — Level 1", at: "24m ago", kind: "enroll" },
  { id: "a3", who: "Ustadh Yusuf", action: "ended live class", target: "Arabic — Level 2", at: "1h ago", kind: "class" },
  { id: "a4", who: "System", action: "flagged failed payment for", target: "INV-8997 · $120", at: "2h ago", kind: "alert" },
  { id: "a5", who: "Fatima Noor", action: "submitted assignment", target: "Surah Al-Mulk recitation", at: "3h ago", kind: "enroll" },
];

export type EducationCourse = {
  id: string;
  title: string;
  cover: string;
  date: string;
  likes: number;
  duration: string;
  professor: string;
  students: string;
};

export const educationCourses: EducationCourse[] = [
  {
    id: "ec1",
    title: "When Is the Best Time to Take an Education Course?",
    cover: "/images/edu_course_1.png",
    date: "April 23",
    likes: 230,
    duration: "12 Months",
    professor: "Jack Ronan",
    students: "+120",
  },
  {
    id: "ec2",
    title: "Education Courses: A Guide to Unlocking Your Potential",
    cover: "/images/edu_course_2.png",
    date: "April 23",
    likes: 450,
    duration: "12 Months",
    professor: "Jimmy Morris",
    students: "+120",
  },
  {
    id: "ec3",
    title: "A Comprehensive Guide to Taking an Education Course",
    cover: "/images/edu_course_3.png",
    date: "April 23",
    likes: 120,
    duration: "12 Months",
    professor: "Konne Backfield",
    students: "+120",
  },
  {
    id: "ec4",
    title: "Why Should You Consider Taking an Education Course?",
    cover: "/images/edu_course_4.png",
    date: "April 23",
    likes: 275,
    duration: "12 Months",
    professor: "Nashid Martines",
    students: "+120",
  },
];

export type ExamTopper = {
  rollNo: string;
  name: string;
  scores: number[];
  color: string;
};

export const examToppers: ExamTopper[] = [
  { rollNo: "542", name: "Jack Ronan", scores: [12, 18, 24, 30, 36, 42, 48, 54, 60], color: "#00c9a7" },
  { rollNo: "243", name: "Jimmy Morris", scores: [36, 12, 48, 24, 60, 30, 42, 18, 54], color: "#3b82f6" },
  { rollNo: "452", name: "Nashid Martines", scores: [12, 36, 24, 48, 12, 36, 24, 48, 12], color: "#8b5cf6" },
  { rollNo: "124", name: "Roman Aurora", scores: [18, 24, 12, 36, 12, 48, 12, 36, 18], color: "#22c55e" },
  { rollNo: "234", name: "Samantha", scores: [24, 36, 12, 48, 30, 42, 18, 54, 24], color: "#4f46e5" },
];

export type NewStudentEntry = {
  no: string;
  name: string;
  professor: string;
  date: string;
  status: "Checkin" | "Pending" | "Canceled";
  subject: string;
  fees: string;
};

export const newStudentList: NewStudentEntry[] = [
  { no: "01", name: "Jack Ronan", professor: "Airi Satou", date: "01 August 2021", status: "Checkin", subject: "Commerce", fees: "120$" },
  { no: "02", name: "Jimmy Morris", professor: "Angelica Ramos", date: "31 July 2021", status: "Pending", subject: "Mechanical", fees: "120$" },
  { no: "03", name: "Nashid Martines", professor: "Ashton Cox", date: "30 July 2021", status: "Canceled", subject: "Science", fees: "520$" },
  { no: "04", name: "Roman Aurora", professor: "Cara Stevens", date: "29 July 2021", status: "Checkin", subject: "Arts", fees: "220$" },
  { no: "05", name: "Samantha", professor: "Bruno Nash", date: "28 July 2021", status: "Checkin", subject: "Maths", fees: "130$" },
];

