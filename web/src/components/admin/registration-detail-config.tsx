import { User, Phone, BookOpen, Users, Briefcase, CalendarClock, Wallet, FileText } from "lucide-react";
import type { SectionDef } from "./full-details-drawer";

const GENDERS = ["Male", "Female", "Other"];

// Student application layout (mirrors the public registration wizard).
export const STUDENT_DETAIL_SECTIONS: SectionDef[] = [
  {
    title: "Basic",
    icon: User,
    fields: [
      { key: "firstName", label: "First Name" },
      { key: "middleName", label: "Middle Name" },
      { key: "lastName", label: "Last Name" },
      { key: "gender", label: "Gender", type: "select", options: GENDERS },
      { key: "dateOfBirth", label: "Date of Birth", type: "date" },
      { key: "nationality", label: "Nationality" },
      { key: "country", label: "Country" },
      { key: "state", label: "State" },
      { key: "city", label: "City" },
      { key: "address", label: "Address", type: "textarea" },
    ],
  },
  {
    title: "Contact",
    icon: Phone,
    fields: [
      { key: "studentEmail", label: "Login Email", type: "readonly" },
      { key: "studentMobile", label: "Student Mobile" },
      { key: "parentEmail", label: "Parent Email" },
      { key: "parentMobile", label: "Parent Mobile" },
      { key: "emergencyContact", label: "Emergency Contact" },
      { key: "whatsappNumber", label: "WhatsApp" },
    ],
  },
  {
    title: "Education",
    icon: BookOpen,
    fields: [
      { key: "currentSchool", label: "Current School" },
      { key: "board", label: "Board" },
      { key: "className", label: "Class" },
      { key: "grade", label: "Grade" },
      { key: "subjects", label: "Subjects" },
      { key: "language", label: "Language" },
    ],
  },
  {
    title: "Course",
    icon: BookOpen,
    fields: [
      { key: "courseCode", label: "Course Code" },
      { key: "courseTitle", label: "Course Title" },
      { key: "batch", label: "Batch" },
      { key: "preferredTiming", label: "Preferred Timing" },
      { key: "learningMode", label: "Learning Mode", type: "select", options: ["ONLINE", "OFFLINE", "HYBRID"] },
    ],
  },
  {
    title: "Guardian",
    icon: Users,
    fields: [
      { key: "fatherName", label: "Father Name" },
      { key: "motherName", label: "Mother Name" },
      { key: "occupation", label: "Occupation" },
      { key: "guardianRelation", label: "Relation" },
      { key: "guardianEmail", label: "Guardian Email" },
      { key: "guardianPhone", label: "Guardian Phone" },
      { key: "guardianAddress", label: "Guardian Address", type: "textarea" },
    ],
  },
];

// Teacher application layout (mirrors the public teacher wizard).
export const TEACHER_DETAIL_SECTIONS: SectionDef[] = [
  {
    title: "Personal",
    icon: User,
    fields: [
      { key: "firstName", label: "First Name" },
      { key: "middleName", label: "Middle Name" },
      { key: "lastName", label: "Last Name" },
      { key: "gender", label: "Gender", type: "select", options: GENDERS },
      { key: "dateOfBirth", label: "Date of Birth", type: "date" },
      { key: "nationality", label: "Nationality" },
      { key: "country", label: "Country" },
      { key: "state", label: "State" },
      { key: "city", label: "City" },
      { key: "address", label: "Address", type: "textarea" },
    ],
  },
  {
    title: "Contact",
    icon: Phone,
    fields: [
      { key: "email", label: "Login Email", type: "readonly" },
      { key: "mobile", label: "Mobile" },
      { key: "whatsappNumber", label: "WhatsApp" },
    ],
  },
  {
    title: "Professional",
    icon: Briefcase,
    fields: [
      { key: "highestQualification", label: "Qualification" },
      { key: "university", label: "University" },
      { key: "passingYear", label: "Passing Year" },
      { key: "experienceYears", label: "Experience (yr)" },
      { key: "currentEmployer", label: "Current Employer" },
      { key: "expectedSalary", label: "Expected Salary" },
      { key: "subjects", label: "Subjects" },
      { key: "languages", label: "Languages" },
      { key: "teachingMode", label: "Teaching Mode", type: "select", options: ["ONLINE", "OFFLINE", "HYBRID"] },
    ],
  },
  {
    title: "Availability & Skills",
    icon: CalendarClock,
    fields: [
      { key: "availabilityDays", label: "Available Days", type: "tags" },
      { key: "availabilitySlots", label: "Time Slots", type: "tags" },
      { key: "technicalSkills", label: "Video Tools", type: "tags" },
    ],
  },
  {
    title: "Bank",
    icon: Wallet,
    fields: [
      { key: "accountNumber", label: "Account #" },
      { key: "ifsc", label: "IFSC / SWIFT" },
      { key: "bankName", label: "Bank" },
      { key: "upi", label: "UPI" },
      { key: "taxNumber", label: "Tax #" },
    ],
  },
  {
    title: "Documents",
    icon: FileText,
    fields: [
      { key: "resumeUrl", label: "Resume / CV", type: "docs" },
      { key: "degreeUrl", label: "Degree", type: "docs" },
      { key: "certificatesUrl", label: "Certificates", type: "docs" },
      { key: "govIdUrl", label: "Government ID", type: "docs" },
      { key: "photoUrl", label: "Photo", type: "docs" },
      { key: "experienceLetterUrl", label: "Experience Letter", type: "docs" },
      { key: "policeVerificationUrl", label: "Police Verification", type: "docs" },
    ],
  },
];
