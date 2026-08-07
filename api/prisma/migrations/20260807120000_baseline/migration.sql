-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'ACADEMIC_COACH', 'TEACHER', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'TRIAL', 'PAUSED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('TRIAL', 'PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClassRescheduleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StudentAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'LEAVE_APPROVED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "TeacherAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'CLASS_CANCELLED');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('ASSIGNED', 'DRAFT', 'SUBMITTED', 'LATE_SUBMITTED', 'UNDER_REVIEW', 'EVALUATED', 'RETURNED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionRequestType" AS ENUM ('PACKAGE_CHANGE', 'SCHEDULE_CHANGE', 'MODEL_CHANGE', 'BREAK_REQUEST');

-- CreateEnum
CREATE TYPE "SubscriptionPricingMode" AS ENUM ('FIXED_MONTHLY', 'HOURLY');

-- CreateEnum
CREATE TYPE "StudentSubscriptionStatus" AS ENUM ('PENDING', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'ON_BREAK', 'ENDED');

-- CreateEnum
CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'SHORTLISTED', 'REJECTED', 'WAITING', 'APPROVED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('SICK', 'CASUAL', 'ANNUAL', 'UNPAID', 'OTHER', 'EMERGENCY', 'PERSONAL', 'TRAINING', 'MEDICAL', 'VACATION', 'FAMILY_EMERGENCY', 'SCHEDULE_CONFLICT', 'RELIGIOUS_HOLIDAY');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('STAFF_LEAVE', 'TEACHER_UNAVAILABILITY');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'INFO_REQUESTED');

-- CreateEnum
CREATE TYPE "LeaveImpactOption" AS ENUM ('PENDING_REVIEW', 'WAIT_FOR_TEACHER', 'TEMPORARY_TEACHER', 'RESCHEDULE');

-- CreateEnum
CREATE TYPE "LeaveImpactStatus" AS ENUM ('OPEN', 'RESOLVED', 'REVERTED');

-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('BANK_TRANSFER', 'WISE', 'PAYPAL', 'CASH', 'STRIPE');

-- CreateEnum
CREATE TYPE "EarningClassType" AS ENUM ('REGULAR', 'TRIAL', 'TRIAL_ENROLL_BONUS');

-- CreateEnum
CREATE TYPE "EarningAttendanceOutcome" AS ENUM ('COMPLETED', 'STUDENT_NO_SHOW', 'TEACHER_ABSENT', 'BOTH_NO_SHOW');

-- CreateEnum
CREATE TYPE "TeacherAbsenceStatus" AS ENUM ('PENDING', 'RESCHEDULED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SalaryStatus" AS ENUM ('CALCULATED', 'UNDER_REVIEW', 'ADJUSTMENT_APPLIED', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "SalaryAdjustmentType" AS ENUM ('EXTRA_PAY', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "SalaryPaymentStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "MonthlyReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('BANK_TRANSFER', 'CREDIT_CARD', 'PAYPAL', 'CASH', 'WISE');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO');

-- CreateEnum
CREATE TYPE "TeacherRegistrationStatus" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'DEMO_CLASS', 'APPROVAL', 'TRAINING', 'ACTIVATED', 'REJECTED', 'NEEDS_INFO');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACT_PENDING', 'CONTACTED', 'EVALUATION_SCHEDULED', 'EVALUATION_COMPLETED', 'TEACHER_ASSIGNED', 'TRIAL_SCHEDULED', 'TRIAL_COMPLETED', 'WAITING_PARENT_DECISION', 'CONVERTED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "LeadTrialStatus" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ACADEMIC', 'ATTENDANCE', 'ASSIGNMENT', 'ASSESSMENT', 'FINANCE', 'PROGRESS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('ALL', 'ROLE', 'COURSE', 'BATCH', 'STUDENTS');

-- CreateEnum
CREATE TYPE "FeePlanCycle" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FeeComponentType" AS ENUM ('ADMISSION', 'COURSE', 'REGISTRATION', 'MATERIAL', 'EXAMINATION', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "DiscountReason" AS ENUM ('SCHOLARSHIP', 'SIBLING', 'PROMOTIONAL', 'STAFF', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScholarshipStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "PayrollModel" AS ENUM ('FIXED', 'PER_CLASS', 'PER_HOUR', 'PER_STUDENT', 'HYBRID');

-- CreateEnum
CREATE TYPE "AssessmentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "AssessmentTemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MonthlyAssessmentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "RankingBadgeRule" AS ENUM ('RANK_1', 'RANK_2', 'RANK_3', 'TOP_10', 'PERFECT_ATTENDANCE', 'MOST_IMPROVED');

-- CreateEnum
CREATE TYPE "StaffMeetingType" AS ENUM ('BIWEEKLY_TEACHER', 'MONTHLY_STAFF', 'TRAINING', 'PERFORMANCE_REVIEW', 'SUPERVISOR_TEACHER', 'COACH_TEACHER', 'ADMIN_STAFF', 'TEACHER_TEACHER', 'DEPARTMENT', 'STUDENT_MEETING');

-- CreateEnum
CREATE TYPE "StaffMeetingStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffMeetingPlatform" AS ENUM ('JITSI', 'ZOOM', 'TEAMS', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingAttendanceStatus" AS ENUM ('INVITED', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "MeetingMinutesStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MeetingActionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MeetingActionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "country" TEXT,
    "timezone" TEXT,
    "avatarUrl" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "phone" TEXT,
    "gender" TEXT,
    "joiningDate" TIMESTAMP(3),
    "salary" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "phone" TEXT,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "guardianName" TEXT,
    "profession" TEXT,
    "fees" DECIMAL(10,2),
    "billingCurrency" TEXT NOT NULL DEFAULT 'USD',
    "stripeCustomerId" TEXT,
    "joiningDate" TIMESTAMP(3),
    "lastPaymentDate" TIMESTAMP(3),
    "nextPaymentDate" TIMESTAMP(3),
    "nationality" TEXT,
    "address" TEXT,
    "timeZone" TEXT,
    "currentGrade" TEXT,
    "currentSchool" TEXT,
    "board" TEXT,
    "learningLevel" TEXT,
    "preferredLanguage" TEXT,
    "learningGoal" TEXT,
    "parentName" TEXT,
    "parentRelationship" TEXT,
    "parentEmail" TEXT,
    "parentMobile" TEXT,
    "parentWhatsapp" TEXT,
    "coachId" TEXT,
    "documents" JSONB,
    "onHoldReason" TEXT,
    "onHoldAt" TIMESTAMP(3),

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentTransfer" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fromLabel" TEXT,
    "toLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "SubscriptionRequestType" NOT NULL,
    "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedPackageId" TEXT,
    "requestedDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestedTime" TEXT,
    "requestedStartDate" TIMESTAMP(3),
    "breakStartDate" TIMESTAMP(3),
    "breakEndDate" TIMESTAMP(3),
    "batchId" TEXT,
    "targetBatchId" TEXT,
    "fromLabel" TEXT,
    "toLabel" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionNextCycle" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "nextPackageId" TEXT,
    "nextDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextTime" TEXT,
    "nextStartDate" TIMESTAMP(3),
    "nextBatchId" TEXT,
    "nextTeacherId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionNextCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentActivity" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "channel" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'STAFF',
    "meta" JSONB,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teacherCode" TEXT NOT NULL,
    "bio" TEXT,
    "specialisation" TEXT,
    "hourlyRate" DECIMAL(10,2),
    "courseId" TEXT,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "levels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "teachingModes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availability" JSONB,
    "availabilityApproved" BOOLEAN NOT NULL DEFAULT false,
    "availabilitySubmittedAt" TIMESTAMP(3),
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "timeZone" TEXT,
    "address" TEXT,
    "whatsapp" TEXT,
    "qualification" TEXT,
    "experienceYears" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "joiningDate" TIMESTAMP(3),
    "documents" JSONB,
    "rating" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "payoutCurrency" TEXT,
    "recipientName" TEXT,
    "payoutCountry" TEXT,
    "payoutBankName" TEXT,
    "iban" TEXT,
    "swift" TEXT,
    "wiseRecipientId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "levelId" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "durationWeeks" INTEGER NOT NULL DEFAULT 12,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceUSD" DECIMAL(10,2) NOT NULL,
    "priceAED" DECIMAL(10,2),
    "priceGBP" DECIMAL(10,2),
    "classesPerMonth" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelId" TEXT,
    "tier" TEXT,
    "durationMinutes" INTEGER,
    "weeklyClasses" INTEGER,
    "monthlyHours" INTEGER,
    "hourlyRateUSD" DECIMAL(10,2),
    "hourlyRateAED" DECIMAL(10,2),
    "hourlyRateGBP" DECIMAL(10,2),
    "rescheduleLimit" INTEGER NOT NULL DEFAULT 0,
    "familyDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "featureMatrix" JSONB,
    "eSyllabus" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "badge" TEXT,
    "feePlanId" TEXT,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionModel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricingMode" "SubscriptionPricingMode" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSubscription" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "courseId" TEXT,
    "modelId" TEXT NOT NULL,
    "pricingMode" "SubscriptionPricingMode" NOT NULL,
    "planId" TEXT,
    "tier" TEXT,
    "currency" TEXT NOT NULL,
    "monthlyPrice" DECIMAL(10,2),
    "hourlyRate" DECIMAL(10,2),
    "durationMinutes" INTEGER NOT NULL,
    "weeklyClasses" INTEGER NOT NULL,
    "monthlyHours" INTEGER NOT NULL,
    "billingCycle" "FeePlanCycle" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewalDate" TIMESTAMP(3),
    "actualCycleStartDate" TIMESTAMP(3),
    "adminStartOverride" BOOLEAN NOT NULL DEFAULT false,
    "preferredTeacherGender" TEXT,
    "remainingClasses" INTEGER NOT NULL DEFAULT 0,
    "completedClasses" INTEGER NOT NULL DEFAULT 0,
    "minutesUsed" INTEGER NOT NULL DEFAULT 0,
    "rescheduleCounter" INTEGER NOT NULL DEFAULT 0,
    "rescheduleLimit" INTEGER NOT NULL DEFAULT 0,
    "teacherRescheduleCounter" INTEGER NOT NULL DEFAULT 0,
    "familyDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "batchId" TEXT,
    "feeAssignmentId" TEXT,
    "pendingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pendingTime" TEXT,
    "pendingTeacherId" TEXT,
    "preferredStartDate" TIMESTAMP(3),
    "breakStartDate" TIMESTAMP(3),
    "breakEndDate" TIMESTAMP(3),
    "status" "StudentSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT,
    "packageId" TEXT,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "batchId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "meetingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminder24hSentAt" TIMESTAMP(3),
    "reminder1hSentAt" TIMESTAMP(3),
    "reminder15mSentAt" TIMESTAMP(3),
    "teacherJoinedAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "meetingId" TEXT,
    "sessionId" TEXT,
    "teacherStatus" "TeacherAttendanceStatus",
    "teacherLateMinutes" INTEGER,
    "attendanceLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "cycleLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassAttendee" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "durationMins" INTEGER,
    "device" TEXT,
    "browser" TEXT,
    "ipAddress" TEXT,
    "status" "StudentAttendanceStatus",
    "lateMinutes" INTEGER,
    "remarks" TEXT,

    CONSTRAINT "ClassAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassRescheduleRequest" (
    "id" TEXT NOT NULL,
    "classSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "oldStartsAt" TIMESTAMP(3) NOT NULL,
    "oldEndsAt" TIMESTAMP(3) NOT NULL,
    "newStartsAt" TIMESTAMP(3) NOT NULL,
    "newEndsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "ClassRescheduleStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassRescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT,
    "level" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "daysOfWeek" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startTime" TEXT,
    "endTime" TEXT,
    "timeZone" TEXT,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchStudent" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "studentId" TEXT,
    "attendeeId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" TEXT,
    "teacherId" TEXT,
    "createdById" TEXT,
    "subject" TEXT,
    "chapter" TEXT,
    "topic" TEXT,
    "skillId" TEXT,
    "difficulty" TEXT,
    "type" TEXT,
    "instructions" TEXT,
    "maxMarks" INTEGER NOT NULL DEFAULT 100,
    "passingMarks" INTEGER NOT NULL DEFAULT 40,
    "lateAllowed" BOOLEAN NOT NULL DEFAULT true,
    "latePenaltyPct" INTEGER NOT NULL DEFAULT 0,
    "publishAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "targetType" TEXT NOT NULL DEFAULT 'BATCH',
    "targetStudentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedFileTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxFileSizeMb" INTEGER,
    "attachments" JSONB,
    "rubric" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'ASSIGNED',
    "content" TEXT,
    "fileUrl" TEXT,
    "attachments" JSONB,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "penaltyApplied" INTEGER,
    "grade" INTEGER,
    "rubricScores" JSONB,
    "feedback" TEXT,
    "feedbackFileUrl" TEXT,
    "similarityPct" INTEGER,
    "returnedReason" TEXT,
    "draftSavedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "chapter" TEXT,
    "topic" TEXT,
    "category" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB,
    "correctAnswer" TEXT,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "negativeMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedTime" INTEGER NOT NULL DEFAULT 60,
    "explanation" TEXT,
    "media" JSONB,
    "rubric" JSONB,
    "language" TEXT,
    "testCases" JSONB,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "courseId" TEXT,
    "batchId" TEXT,
    "teacherId" TEXT,
    "createdById" TEXT,
    "subject" TEXT,
    "chapter" TEXT,
    "topic" TEXT,
    "category" TEXT,
    "skillId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'QUIZ',
    "instructions" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "totalMarks" INTEGER NOT NULL DEFAULT 100,
    "passingMarks" INTEGER NOT NULL DEFAULT 40,
    "attemptsAllowed" INTEGER NOT NULL DEFAULT 1,
    "questionOrder" TEXT NOT NULL DEFAULT 'FIXED',
    "allowBack" BOOLEAN NOT NULL DEFAULT true,
    "showResultImmediately" BOOLEAN NOT NULL DEFAULT false,
    "negativeMarking" BOOLEAN NOT NULL DEFAULT false,
    "selectionMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "randomRules" JSONB,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "publishAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "targetType" TEXT NOT NULL DEFAULT 'BATCH',
    "targetStudentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "certificateThreshold" INTEGER NOT NULL DEFAULT 70,
    "proctored" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "marks" INTEGER,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "timeSpentSec" INTEGER,
    "autoScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMarks" INTEGER NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "teacherFeedback" TEXT,
    "certificateUrl" TEXT,
    "certificateNo" TEXT,
    "violations" INTEGER NOT NULL DEFAULT 0,
    "proctorLog" JSONB,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" JSONB,
    "markedForReview" BOOLEAN NOT NULL DEFAULT false,
    "isCorrect" BOOLEAN,
    "awardedMarks" DOUBLE PRECISION,
    "maxMarks" INTEGER NOT NULL DEFAULT 1,
    "rubricScores" JSONB,
    "feedback" TEXT,
    "autoGraded" BOOLEAN NOT NULL DEFAULT false,
    "timeSpentSec" INTEGER,

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "studentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "feePlanId" TEXT,
    "assignmentId" TEXT,
    "subscriptionId" TEXT,
    "periodLabel" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "subtotal" DECIMAL(10,2),
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountId" TEXT,
    "scholarshipId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "FeeComponentType" NOT NULL DEFAULT 'OTHER',
    "label" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "providerRef" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "reference" TEXT,
    "receivedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "invoiceId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "studentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT,
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "position" TEXT NOT NULL,
    "resumeUrl" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "LeaveCategory" NOT NULL DEFAULT 'STAFF_LEAVE',
    "leaveType" "LeaveType" NOT NULL DEFAULT 'CASUAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "documentUrl" TEXT,
    "documentName" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "isPaid" BOOLEAN,
    "deductionAmount" DECIMAL(10,2),
    "salaryAdjustmentId" TEXT,
    "deductionAppliedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "infoRequest" TEXT,
    "infoRequestedAt" TIMESTAMP(3),
    "infoResponse" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "originalStartDate" TIMESTAMP(3),
    "originalEndDate" TIMESTAMP(3),
    "availabilityBlockedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "availabilitySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveImpact" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "courseId" TEXT,
    "courseTitle" TEXT,
    "originalTeacherId" TEXT NOT NULL,
    "affectedClassCount" INTEGER NOT NULL DEFAULT 0,
    "option" "LeaveImpactOption" NOT NULL DEFAULT 'PENDING_REVIEW',
    "status" "LeaveImpactStatus" NOT NULL DEFAULT 'OPEN',
    "temporaryTeacherId" TEXT,
    "temporaryTeacherName" TEXT,
    "restoreOriginal" BOOLEAN NOT NULL DEFAULT true,
    "pausedSubscriptionId" TEXT,
    "cycleExtendedDays" INTEGER,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveImpact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveAuditLog" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "meta" JSONB,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "prefTeacherGender" TEXT NOT NULL,
    "status" "TrialStatus" NOT NULL DEFAULT 'PENDING',
    "age" INTEGER NOT NULL,
    "goals" TEXT,
    "scheduledTime" TEXT,
    "assignedTeacher" TEXT,
    "meetLink" TEXT,
    "pronunciationGrade" TEXT,
    "fluencyGrade" TEXT,
    "focusGrade" TEXT,
    "recommendedLevel" TEXT,
    "evaluationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsCourse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "studentsCount" INTEGER NOT NULL DEFAULT 0,
    "teachersCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "durationWeeks" INTEGER,

    CONSTRAINT "LmsCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsAssignment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "studentsCount" INTEGER NOT NULL DEFAULT 0,
    "submissionsCount" INTEGER NOT NULL DEFAULT 0,
    "evaluatedCount" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT NOT NULL,

    CONSTRAINT "LmsAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsAssessment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "questionsCount" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "avgScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT NOT NULL,

    CONSTRAINT "LmsAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsKnowledgebase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "sizeMB" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,

    CONSTRAINT "LmsKnowledgebase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsPackage" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priceUSD" DOUBLE PRECISION NOT NULL,
    "priceAED" DOUBLE PRECISION,
    "priceGBP" DOUBLE PRECISION,
    "billing" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "courses" TEXT[],
    "features" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'Active',
    "description" TEXT NOT NULL,
    "classesPerMonth" INTEGER,
    "feePlanId" TEXT,
    "modelId" TEXT,
    "tier" TEXT,
    "durationMinutes" INTEGER,
    "weeklyClasses" INTEGER,
    "monthlyHours" INTEGER,
    "hourlyRateUSD" DOUBLE PRECISION,
    "hourlyRateAED" DOUBLE PRECISION,
    "hourlyRateGBP" DOUBLE PRECISION,
    "rescheduleLimit" INTEGER DEFAULT 0,
    "familyDiscountPct" DOUBLE PRECISION DEFAULT 0,
    "featureMatrix" JSONB,
    "eSyllabus" BOOLEAN DEFAULT false,
    "displayOrder" INTEGER DEFAULT 0,
    "badge" TEXT,

    CONSTRAINT "LmsPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsClass" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "teacher" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 15,
    "enrolled" INTEGER NOT NULL DEFAULT 0,
    "timeStart" TEXT NOT NULL,
    "timeEnd" TEXT NOT NULL,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Upcoming',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LmsClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LmsMeeting" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timeStart" TEXT NOT NULL,
    "timeEnd" TEXT NOT NULL,
    "link" TEXT,
    "host" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Upcoming',
    "agenda" TEXT,
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LmsMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "deductions" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" "PayoutMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paymentDate" TIMESTAMP(3),
    "referenceNumber" TEXT,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "payslipNo" TEXT,
    "payrollModel" TEXT,
    "classesCount" INTEGER,
    "hoursCount" DOUBLE PRECISION,
    "studentsCount" INTEGER,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherEarning" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classSessionId" TEXT,
    "leadTrialId" TEXT,
    "studentId" TEXT,
    "courseId" TEXT,
    "classType" "EarningClassType" NOT NULL DEFAULT 'REGULAR',
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "outcome" "EarningAttendanceOutcome" NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "salaryId" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherAbsenceTask" (
    "id" TEXT NOT NULL,
    "classSessionId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "studentId" TEXT,
    "courseId" TEXT,
    "originalStartsAt" TIMESTAMP(3) NOT NULL,
    "status" "TeacherAbsenceStatus" NOT NULL DEFAULT 'PENDING',
    "rescheduledSessionId" TEXT,
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherAbsenceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSalary" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "totalClasses" INTEGER NOT NULL DEFAULT 0,
    "trialEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "regularEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bonusEarnings" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "adjustmentsTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "SalaryStatus" NOT NULL DEFAULT 'CALCULATED',
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "wiseReference" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryAdjustment" (
    "id" TEXT NOT NULL,
    "salaryId" TEXT NOT NULL,
    "type" "SalaryAdjustmentType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL,
    "salaryId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reference" TEXT,
    "status" "SalaryPaymentStatus" NOT NULL,
    "failureReason" TEXT,
    "attemptedById" TEXT,
    "attemptedByName" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherMonthlyReport" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "summary" TEXT,
    "strengths" TEXT,
    "areasToImprove" TEXT,
    "recommendation" TEXT,
    "attendanceNote" TEXT,
    "status" "MonthlyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "supervisorReviewedById" TEXT,
    "supervisorReviewedByName" TEXT,
    "supervisorReviewedAt" TIMESTAMP(3),
    "adminReviewedById" TEXT,
    "adminReviewedByName" TEXT,
    "adminReviewedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherMonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchant" TEXT,
    "referenceNo" TEXT,
    "receiptUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT,
    "teacherId" TEXT,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentRegistration" (
    "id" TEXT NOT NULL,
    "registrantType" TEXT NOT NULL DEFAULT 'STUDENT',
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "address" TEXT,
    "studentEmail" TEXT NOT NULL,
    "studentMobile" TEXT,
    "parentEmail" TEXT,
    "parentMobile" TEXT,
    "emergencyContact" TEXT,
    "whatsappNumber" TEXT,
    "currentSchool" TEXT,
    "board" TEXT,
    "className" TEXT,
    "grade" TEXT,
    "subjects" TEXT,
    "language" TEXT,
    "courseCode" TEXT,
    "courseTitle" TEXT,
    "batch" TEXT,
    "preferredTiming" TEXT,
    "learningMode" TEXT,
    "fatherName" TEXT,
    "motherName" TEXT,
    "occupation" TEXT,
    "guardianRelation" TEXT,
    "guardianAddress" TEXT,
    "guardianEmail" TEXT,
    "guardianPhone" TEXT,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "studentProfileId" TEXT,
    "admissionNumber" TEXT,
    "rollNumber" TEXT,
    "approvedStudentCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherRegistration" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "address" TEXT,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "whatsappNumber" TEXT,
    "highestQualification" TEXT,
    "university" TEXT,
    "passingYear" TEXT,
    "experienceYears" TEXT,
    "currentEmployer" TEXT,
    "expectedSalary" TEXT,
    "subjects" TEXT,
    "languages" TEXT,
    "teachingMode" TEXT,
    "availabilityDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availabilitySlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technicalSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "bankName" TEXT,
    "upi" TEXT,
    "taxNumber" TEXT,
    "resumeUrl" TEXT,
    "degreeUrl" TEXT,
    "certificatesUrl" TEXT,
    "govIdUrl" TEXT,
    "photoUrl" TEXT,
    "experienceLetterUrl" TEXT,
    "policeVerificationUrl" TEXT,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "TeacherRegistrationStatus" NOT NULL DEFAULT 'APPLIED',
    "reviewNotes" TEXT,
    "interviewDate" TIMESTAMP(3),
    "interviewNotes" TEXT,
    "demoDate" TIMESTAMP(3),
    "demoNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "teacherProfileId" TEXT,
    "approvedTeacherCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "leadNumber" TEXT NOT NULL,
    "studentFirstName" TEXT NOT NULL,
    "studentLastName" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "currentGrade" TEXT,
    "currentSchool" TEXT,
    "country" TEXT,
    "timeZone" TEXT,
    "parentName" TEXT,
    "relationship" TEXT,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "interestedSubject" TEXT,
    "currentLevel" TEXT,
    "preferredLanguage" TEXT,
    "preferredTeacherGender" TEXT,
    "preferredDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredTimeSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredDate" TIMESTAMP(3),
    "preferredSlot" TEXT,
    "preferredSlotTz" TEXT,
    "sessionFor" TEXT,
    "howFound" TEXT,
    "countryCode" TEXT,
    "siblings" JSONB,
    "learningGoal" TEXT,
    "previousCoaching" TEXT,
    "specialRequirements" TEXT,
    "medicalDisability" TEXT,
    "acceptPrivacy" BOOLEAN NOT NULL DEFAULT false,
    "acceptTerms" BOOLEAN NOT NULL DEFAULT false,
    "recaptchaToken" TEXT,
    "leadSource" TEXT NOT NULL DEFAULT 'Website',
    "ipAddress" TEXT,
    "browser" TEXT,
    "device" TEXT,
    "referralUrl" TEXT,
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "utmMedium" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedCoachId" TEXT,
    "assignedCoachAt" TIMESTAMP(3),
    "evaluationScores" JSONB,
    "overallScore" DOUBLE PRECISION,
    "evaluationNotes" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "evaluatedById" TEXT,
    "recommendedLevel" TEXT,
    "recommendedBatch" TEXT,
    "recommendedTeacherId" TEXT,
    "assignedTeacherId" TEXT,
    "assignedTeacherAt" TIMESTAMP(3),
    "coachDecision" TEXT,
    "coachDecisionNotes" TEXT,
    "coachDecisionAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "convertedStudentId" TEXT,
    "convertedStudentCode" TEXT,
    "convertedStudents" JSONB,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadTrial" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "teacherId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 30,
    "timeZone" TEXT,
    "meetingProvider" TEXT,
    "meetingLink" TEXT,
    "meetingId" TEXT,
    "meetingHostUrl" TEXT,
    "status" "LeadTrialStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reminder24hSentAt" TIMESTAMP(3),
    "reminder1hSentAt" TIMESTAMP(3),
    "attendance" TEXT,
    "attendedAt" TIMESTAMP(3),
    "teacherRating" INTEGER,
    "teacherFeedback" TEXT,
    "teacherRecommendsEnroll" BOOLEAN,
    "parentRating" INTEGER,
    "parentFeedback" TEXT,
    "parentInterested" BOOLEAN,
    "coveredIntro" BOOLEAN NOT NULL DEFAULT false,
    "coveredPresentation" BOOLEAN NOT NULL DEFAULT false,
    "coveredDemoLesson" BOOLEAN NOT NULL DEFAULT false,
    "coveredPackages" BOOLEAN NOT NULL DEFAULT false,
    "verifiedDetails" BOOLEAN NOT NULL DEFAULT false,
    "studentAge" INTEGER,
    "studentDob" TIMESTAMP(3),
    "guardianName" TEXT,
    "guardianRelation" TEXT,
    "guardianPhone" TEXT,
    "guardianEmail" TEXT,
    "preferredPackage" TEXT,
    "preferredDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredTime" TEXT,
    "preferredStartDate" TIMESTAMP(3),
    "assessedLevel" TEXT,
    "recommendedCourseId" TEXT,
    "recommendedCourse" TEXT,
    "reportNotes" TEXT,
    "reportSubmittedAt" TIMESTAMP(3),
    "infoTokenHash" TEXT,
    "infoTokenExpiresAt" TIMESTAMP(3),
    "infoRequestedAt" TIMESTAMP(3),
    "infoRequestedById" TEXT,
    "infoSubmittedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadTrial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "NotificationStatus" NOT NULL DEFAULT 'SENT',
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "actorId" TEXT,
    "actorName" TEXT,
    "broadcastId" TEXT,
    "templateCode" TEXT,
    "meta" JSONB,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "skippedReason" TEXT,
    "target" TEXT,
    "providerRef" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "muteMarketing" BOOLEAN NOT NULL DEFAULT false,
    "mutedCategories" "NotificationCategory"[] DEFAULT ARRAY[]::"NotificationCategory"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "channels" "NotificationChannel"[] DEFAULT ARRAY[]::"NotificationChannel"[],
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "link" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationBroadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "templateCode" TEXT,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "channels" "NotificationChannel"[] DEFAULT ARRAY[]::"NotificationChannel"[],
    "audience" "BroadcastAudience" NOT NULL DEFAULT 'ALL',
    "roles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "courseId" TEXT,
    "batchId" TEXT,
    "studentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduledAt" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressSkill" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSkillProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSkillProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherFeedback" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT,
    "classSessionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'CLASS',
    "participation" INTEGER,
    "homework" INTEGER,
    "communication" INTEGER,
    "understanding" INTEGER,
    "behavior" INTEGER,
    "remarks" TEXT,
    "suggestions" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningGoal" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "skillId" TEXT,
    "currentPct" INTEGER NOT NULL DEFAULT 0,
    "targetPct" INTEGER NOT NULL DEFAULT 100,
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdByName" TEXT,
    "achievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReview" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "coachId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "academic" INTEGER,
    "attendance" INTEGER,
    "behavior" INTEGER,
    "participation" INTEGER,
    "learningSpeed" INTEGER,
    "homework" INTEGER,
    "communication" INTEGER,
    "recommendation" TEXT,
    "remarks" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "tone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentBadge" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "StudentBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressRiskFlag" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'AT_RISK',
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attendancePct" DOUBLE PRECISION,
    "assignmentPct" DOUBLE PRECISION,
    "assessmentPct" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressRiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentMeeting" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "coachId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "agenda" TEXT,
    "notes" TEXT,
    "actionItems" JSONB,
    "nextReviewAt" TIMESTAMP(3),
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressSnapshot" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "attendancePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assignmentPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assessmentPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedbackScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coachScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "statusLabel" TEXT NOT NULL DEFAULT 'AVERAGE',
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cycle" "FeePlanCycle" NOT NULL DEFAULT 'MONTHLY',
    "courseId" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePlanComponent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" "FeeComponentType" NOT NULL DEFAULT 'COURSE',
    "label" TEXT NOT NULL,
    "amountUSD" DECIMAL(10,2) NOT NULL,
    "amountAED" DECIMAL(10,2),
    "amountGBP" DECIMAL(10,2),

    CONSTRAINT "FeePlanComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFeeAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRunAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "autoGenerate" BOOLEAN NOT NULL DEFAULT true,
    "discountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "value" DECIMAL(10,2) NOT NULL,
    "reason" "DiscountReason" NOT NULL DEFAULT 'PROMOTIONAL',
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scholarship" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "value" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "status" "ScholarshipStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewNotes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scholarship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "studentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL,
    "method" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "reviewNotes" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" "PayrollModel" NOT NULL DEFAULT 'FIXED',
    "baseSalary" DECIMAL(10,2),
    "perClassRate" DECIMAL(10,2),
    "perHourRate" DECIMAL(10,2),
    "perStudentRate" DECIMAL(10,2),
    "standardBonus" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentLink" (
    "id" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relationship" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'KPI',
    "defaultSize" TEXT NOT NULL DEFAULT 'MD',
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RoleWidgetSetting" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "widgetKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleWidgetSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWidgetLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgetKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "size" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWidgetLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "link" TEXT,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingScale" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeBand" (
    "id" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minPercent" DECIMAL(5,2) NOT NULL,
    "maxPercent" DECIMAL(5,2) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GradeBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "levelId" TEXT,
    "frequency" "AssessmentFrequency" NOT NULL DEFAULT 'MONTHLY',
    "maxMarks" INTEGER NOT NULL DEFAULT 100,
    "passingMarks" INTEGER NOT NULL DEFAULT 40,
    "gradingScaleId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "AssessmentTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentCriterion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssessmentCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyAssessment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT,
    "courseId" TEXT NOT NULL,
    "templateId" TEXT,
    "subscriptionId" TEXT,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "cycleIndex" INTEGER NOT NULL DEFAULT 0,
    "monthLabel" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "levelName" TEXT,
    "attendancePct" INTEGER NOT NULL DEFAULT 0,
    "attendedClasses" INTEGER NOT NULL DEFAULT 0,
    "totalClasses" INTEGER NOT NULL DEFAULT 0,
    "assignmentPct" INTEGER NOT NULL DEFAULT 0,
    "assignmentsSubmitted" INTEGER NOT NULL DEFAULT 0,
    "assignmentsTotal" INTEGER NOT NULL DEFAULT 0,
    "homeworkPct" INTEGER NOT NULL DEFAULT 0,
    "totalMarks" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "maxMarks" INTEGER NOT NULL DEFAULT 100,
    "passingMarks" INTEGER NOT NULL DEFAULT 40,
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "grade" TEXT,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "teacherRemarks" TEXT,
    "recommendations" TEXT,
    "status" "MonthlyAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "returnedReason" TEXT,
    "returnedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenedByName" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyAssessmentScore" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "criterionId" TEXT,
    "criterionName" TEXT NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "marks" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "comment" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MonthlyAssessmentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentFeedback" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedByName" TEXT,
    "rating" INTEGER,
    "comment" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentRanking" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "assessmentScore" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "attendancePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "assignmentScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "homeworkPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "teacherRating" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "totalScore" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingBadgeConfig" (
    "id" TEXT NOT NULL,
    "rule" "RankingBadgeRule" NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RankingBadgeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingBadge" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "rule" "RankingBadgeRule" NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "monthLabel" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMeeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "StaffMeetingType" NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "timeZone" TEXT,
    "platform" "StaffMeetingPlatform" NOT NULL DEFAULT 'JITSI',
    "meetingLink" TEXT,
    "externalId" TEXT,
    "status" "StaffMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "organizerId" TEXT NOT NULL,
    "organizerName" TEXT,
    "seriesId" TEXT,
    "occurrenceIndex" INTEGER,
    "minutesStatus" "MeetingMinutesStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "summary" TEXT,
    "discussionPoints" TEXT,
    "decisions" TEXT,
    "remarks" TEXT,
    "minutesPublishedAt" TIMESTAMP(3),
    "minutesById" TEXT,
    "minutesByName" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByName" TEXT,
    "cancelReason" TEXT,
    "rescheduledFrom" TIMESTAMP(3),
    "rescheduleNote" TEXT,
    "reminder24SentAt" TIMESTAMP(3),
    "reminder1SentAt" TIMESTAMP(3),
    "startedNotifiedAt" TIMESTAMP(3),
    "absenceMarkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "status" "MeetingAttendanceStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "durationMins" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "excuseReason" TEXT,
    "markedById" TEXT,
    "markedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingActionItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedToId" TEXT,
    "assignedToName" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" "MeetingActionPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MeetingActionStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttachment" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMeetingSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StaffMeetingType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "intervalWeeks" INTEGER NOT NULL DEFAULT 2,
    "weekday" INTEGER NOT NULL DEFAULT 6,
    "startTime" TEXT NOT NULL DEFAULT '18:00',
    "durationMins" INTEGER NOT NULL DEFAULT 60,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "organizerId" TEXT,
    "organizerName" TEXT,
    "platform" "StaffMeetingPlatform" NOT NULL DEFAULT 'JITSI',
    "description" TEXT,
    "inviteRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionalInviteRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generateAheadWeeks" INTEGER NOT NULL DEFAULT 8,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMeetingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAuditLog" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "meta" JSONB,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_studentCode_key" ON "StudentProfile"("studentCode");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_stripeCustomerId_key" ON "StudentProfile"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "StudentTransfer_studentId_status_idx" ON "StudentTransfer"("studentId", "status");

-- CreateIndex
CREATE INDEX "StudentTransfer_status_idx" ON "StudentTransfer"("status");

-- CreateIndex
CREATE INDEX "SubscriptionRequest_studentId_status_idx" ON "SubscriptionRequest"("studentId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionRequest_status_idx" ON "SubscriptionRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionNextCycle_studentId_key" ON "SubscriptionNextCycle"("studentId");

-- CreateIndex
CREATE INDEX "StudentActivity_studentId_kind_idx" ON "StudentActivity"("studentId", "kind");

-- CreateIndex
CREATE INDEX "StudentActivity_studentId_createdAt_idx" ON "StudentActivity"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_userId_key" ON "TeacherProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_teacherCode_key" ON "TeacherProfile"("teacherCode");

-- CreateIndex
CREATE UNIQUE INDEX "Level_name_key" ON "Level"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Package_name_key" ON "Package"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionModel_key_key" ON "SubscriptionModel"("key");

-- CreateIndex
CREATE INDEX "StudentSubscription_studentId_status_idx" ON "StudentSubscription"("studentId", "status");

-- CreateIndex
CREATE INDEX "StudentSubscription_status_idx" ON "StudentSubscription"("status");

-- CreateIndex
CREATE INDEX "Enrollment_status_idx" ON "Enrollment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_courseId_key" ON "Enrollment"("studentId", "courseId");

-- CreateIndex
CREATE INDEX "ClassSession_startsAt_idx" ON "ClassSession"("startsAt");

-- CreateIndex
CREATE INDEX "ClassSession_teacherId_startsAt_idx" ON "ClassSession"("teacherId", "startsAt");

-- CreateIndex
CREATE INDEX "ClassSession_batchId_startsAt_idx" ON "ClassSession"("batchId", "startsAt");

-- CreateIndex
CREATE INDEX "ClassSession_status_idx" ON "ClassSession"("status");

-- CreateIndex
CREATE INDEX "ClassAttendee_studentId_idx" ON "ClassAttendee"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassAttendee_classId_studentId_key" ON "ClassAttendee"("classId", "studentId");

-- CreateIndex
CREATE INDEX "ClassRescheduleRequest_status_idx" ON "ClassRescheduleRequest"("status");

-- CreateIndex
CREATE INDEX "ClassRescheduleRequest_studentId_status_idx" ON "ClassRescheduleRequest"("studentId", "status");

-- CreateIndex
CREATE INDEX "ClassRescheduleRequest_teacherId_studentId_idx" ON "ClassRescheduleRequest"("teacherId", "studentId");

-- CreateIndex
CREATE INDEX "ClassRescheduleRequest_classSessionId_idx" ON "ClassRescheduleRequest"("classSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_code_key" ON "Batch"("code");

-- CreateIndex
CREATE INDEX "Batch_courseId_idx" ON "Batch"("courseId");

-- CreateIndex
CREATE INDEX "Batch_teacherId_idx" ON "Batch"("teacherId");

-- CreateIndex
CREATE INDEX "Batch_status_idx" ON "Batch"("status");

-- CreateIndex
CREATE INDEX "BatchStudent_studentId_idx" ON "BatchStudent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchStudent_batchId_studentId_key" ON "BatchStudent"("batchId", "studentId");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_classId_idx" ON "AttendanceCorrection"("classId");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_status_idx" ON "AttendanceCorrection"("status");

-- CreateIndex
CREATE INDEX "Assignment_status_idx" ON "Assignment"("status");

-- CreateIndex
CREATE INDEX "Assignment_teacherId_idx" ON "Assignment"("teacherId");

-- CreateIndex
CREATE INDEX "Assignment_batchId_idx" ON "Assignment"("batchId");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_key" ON "Submission"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "Question_subject_idx" ON "Question"("subject");

-- CreateIndex
CREATE INDEX "Question_type_idx" ON "Question"("type");

-- CreateIndex
CREATE INDEX "Question_difficulty_idx" ON "Question"("difficulty");

-- CreateIndex
CREATE INDEX "Question_archived_idx" ON "Question"("archived");

-- CreateIndex
CREATE INDEX "Assessment_status_idx" ON "Assessment"("status");

-- CreateIndex
CREATE INDEX "Assessment_teacherId_idx" ON "Assessment"("teacherId");

-- CreateIndex
CREATE INDEX "Assessment_batchId_idx" ON "Assessment"("batchId");

-- CreateIndex
CREATE INDEX "Assessment_courseId_idx" ON "Assessment"("courseId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_questionId_key" ON "AssessmentQuestion"("assessmentId", "questionId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_assessmentId_idx" ON "AssessmentAttempt"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_studentId_idx" ON "AssessmentAttempt"("studentId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_status_idx" ON "AssessmentAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_assessmentId_studentId_attemptNo_key" ON "AssessmentAttempt"("assessmentId", "studentId", "attemptNo");

-- CreateIndex
CREATE INDEX "AssessmentAnswer_attemptId_idx" ON "AssessmentAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAnswer_attemptId_questionId_key" ON "AssessmentAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_studentId_idx" ON "Invoice"("studentId");

-- CreateIndex
CREATE INDEX "Invoice_assignmentId_idx" ON "Invoice"("assignmentId");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_type_idx" ON "StripeWebhookEvent"("type");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_handled_idx" ON "StripeWebhookEvent"("handled");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_number_key" ON "Receipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Receipt_invoiceId_idx" ON "Receipt"("invoiceId");

-- CreateIndex
CREATE INDEX "Receipt_studentId_idx" ON "Receipt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_idx" ON "LeaveRequest"("userId");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_category_status_idx" ON "LeaveRequest"("category", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveImpact_status_idx" ON "LeaveImpact"("status");

-- CreateIndex
CREATE INDEX "LeaveImpact_originalTeacherId_idx" ON "LeaveImpact"("originalTeacherId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveImpact_leaveId_studentId_key" ON "LeaveImpact"("leaveId", "studentId");

-- CreateIndex
CREATE INDEX "LeaveAuditLog_leaveId_createdAt_idx" ON "LeaveAuditLog"("leaveId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveAuditLog_action_createdAt_idx" ON "LeaveAuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_type_key" ON "Category"("name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LmsCourse_code_key" ON "LmsCourse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_payslipNo_key" ON "Payout"("payslipNo");

-- CreateIndex
CREATE INDEX "Payout_userId_idx" ON "Payout"("userId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherEarning_classSessionId_key" ON "TeacherEarning"("classSessionId");

-- CreateIndex
CREATE INDEX "TeacherEarning_teacherId_earnedAt_idx" ON "TeacherEarning"("teacherId", "earnedAt");

-- CreateIndex
CREATE INDEX "TeacherEarning_salaryId_idx" ON "TeacherEarning"("salaryId");

-- CreateIndex
CREATE INDEX "TeacherEarning_teacherId_paid_idx" ON "TeacherEarning"("teacherId", "paid");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherEarning_leadTrialId_classType_key" ON "TeacherEarning"("leadTrialId", "classType");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAbsenceTask_classSessionId_key" ON "TeacherAbsenceTask"("classSessionId");

-- CreateIndex
CREATE INDEX "TeacherAbsenceTask_status_idx" ON "TeacherAbsenceTask"("status");

-- CreateIndex
CREATE INDEX "TeacherAbsenceTask_teacherId_status_idx" ON "TeacherAbsenceTask"("teacherId", "status");

-- CreateIndex
CREATE INDEX "TeacherSalary_status_idx" ON "TeacherSalary"("status");

-- CreateIndex
CREATE INDEX "TeacherSalary_periodStart_idx" ON "TeacherSalary"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSalary_teacherId_periodStart_key" ON "TeacherSalary"("teacherId", "periodStart");

-- CreateIndex
CREATE INDEX "SalaryAdjustment_salaryId_idx" ON "SalaryAdjustment"("salaryId");

-- CreateIndex
CREATE INDEX "SalaryPayment_salaryId_idx" ON "SalaryPayment"("salaryId");

-- CreateIndex
CREATE INDEX "SalaryPayment_teacherId_idx" ON "SalaryPayment"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherMonthlyReport_teacherId_periodStart_idx" ON "TeacherMonthlyReport"("teacherId", "periodStart");

-- CreateIndex
CREATE INDEX "TeacherMonthlyReport_status_idx" ON "TeacherMonthlyReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherMonthlyReport_teacherId_studentId_periodStart_key" ON "TeacherMonthlyReport"("teacherId", "studentId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "StudentRegistration_status_idx" ON "StudentRegistration"("status");

-- CreateIndex
CREATE INDEX "TeacherRegistration_status_idx" ON "TeacherRegistration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_leadNumber_key" ON "Lead"("leadNumber");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_assignedCoachId_idx" ON "Lead"("assignedCoachId");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "LeadTrial_leadId_idx" ON "LeadTrial"("leadId");

-- CreateIndex
CREATE INDEX "LeadTrial_teacherId_idx" ON "LeadTrial"("teacherId");

-- CreateIndex
CREATE INDEX "LeadTrial_scheduledAt_idx" ON "LeadTrial"("scheduledAt");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_archivedAt_createdAt_idx" ON "Notification"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_category_idx" ON "Notification"("category");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_broadcastId_idx" ON "Notification"("broadcastId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_channel_idx" ON "NotificationDelivery"("status", "channel");

-- CreateIndex
CREATE INDEX "NotificationDelivery_queuedAt_idx" ON "NotificationDelivery"("queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_code_key" ON "NotificationTemplate"("code");

-- CreateIndex
CREATE INDEX "NotificationTemplate_category_idx" ON "NotificationTemplate"("category");

-- CreateIndex
CREATE INDEX "NotificationBroadcast_status_scheduledAt_idx" ON "NotificationBroadcast"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "ProgressSkill_courseId_idx" ON "ProgressSkill"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSkill_courseId_name_key" ON "ProgressSkill"("courseId", "name");

-- CreateIndex
CREATE INDEX "StudentSkillProgress_studentId_idx" ON "StudentSkillProgress"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSkillProgress_studentId_skillId_key" ON "StudentSkillProgress"("studentId", "skillId");

-- CreateIndex
CREATE INDEX "TeacherFeedback_studentId_kind_idx" ON "TeacherFeedback"("studentId", "kind");

-- CreateIndex
CREATE INDEX "TeacherFeedback_studentId_createdAt_idx" ON "TeacherFeedback"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "TeacherFeedback_teacherId_idx" ON "TeacherFeedback"("teacherId");

-- CreateIndex
CREATE INDEX "LearningGoal_studentId_status_idx" ON "LearningGoal"("studentId", "status");

-- CreateIndex
CREATE INDEX "MonthlyReview_studentId_idx" ON "MonthlyReview"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReview_studentId_periodStart_key" ON "MonthlyReview"("studentId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE INDEX "StudentBadge_studentId_idx" ON "StudentBadge"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentBadge_studentId_badgeId_key" ON "StudentBadge"("studentId", "badgeId");

-- CreateIndex
CREATE INDEX "ProgressRiskFlag_studentId_status_idx" ON "ProgressRiskFlag"("studentId", "status");

-- CreateIndex
CREATE INDEX "ProgressRiskFlag_status_idx" ON "ProgressRiskFlag"("status");

-- CreateIndex
CREATE INDEX "ParentMeeting_studentId_status_idx" ON "ParentMeeting"("studentId", "status");

-- CreateIndex
CREATE INDEX "ProgressSnapshot_studentId_idx" ON "ProgressSnapshot"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSnapshot_studentId_periodStart_key" ON "ProgressSnapshot"("studentId", "periodStart");

-- CreateIndex
CREATE INDEX "FeePlan_active_idx" ON "FeePlan"("active");

-- CreateIndex
CREATE INDEX "FeePlanComponent_planId_idx" ON "FeePlanComponent"("planId");

-- CreateIndex
CREATE INDEX "StudentFeeAssignment_studentId_idx" ON "StudentFeeAssignment"("studentId");

-- CreateIndex
CREATE INDEX "StudentFeeAssignment_planId_idx" ON "StudentFeeAssignment"("planId");

-- CreateIndex
CREATE INDEX "StudentFeeAssignment_active_idx" ON "StudentFeeAssignment"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Discount_code_key" ON "Discount"("code");

-- CreateIndex
CREATE INDEX "Discount_active_idx" ON "Discount"("active");

-- CreateIndex
CREATE INDEX "Scholarship_studentId_idx" ON "Scholarship"("studentId");

-- CreateIndex
CREATE INDEX "Scholarship_status_idx" ON "Scholarship"("status");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "Refund_studentId_idx" ON "Refund"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollConfig_userId_key" ON "PayrollConfig"("userId");

-- CreateIndex
CREATE INDEX "ParentLink_parentUserId_idx" ON "ParentLink"("parentUserId");

-- CreateIndex
CREATE INDEX "ParentLink_studentId_idx" ON "ParentLink"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentLink_parentUserId_studentId_key" ON "ParentLink"("parentUserId", "studentId");

-- CreateIndex
CREATE INDEX "RoleWidgetSetting_role_idx" ON "RoleWidgetSetting"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RoleWidgetSetting_role_widgetKey_key" ON "RoleWidgetSetting"("role", "widgetKey");

-- CreateIndex
CREATE INDEX "UserWidgetLayout_userId_idx" ON "UserWidgetLayout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWidgetLayout_userId_widgetKey_key" ON "UserWidgetLayout"("userId", "widgetKey");

-- CreateIndex
CREATE INDEX "Announcement_active_publishedAt_idx" ON "Announcement"("active", "publishedAt");

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GradingScale_name_key" ON "GradingScale"("name");

-- CreateIndex
CREATE INDEX "GradeBand_scaleId_idx" ON "GradeBand"("scaleId");

-- CreateIndex
CREATE INDEX "AssessmentTemplate_courseId_status_idx" ON "AssessmentTemplate"("courseId", "status");

-- CreateIndex
CREATE INDEX "AssessmentCriterion_templateId_idx" ON "AssessmentCriterion"("templateId");

-- CreateIndex
CREATE INDEX "MonthlyAssessment_status_idx" ON "MonthlyAssessment"("status");

-- CreateIndex
CREATE INDEX "MonthlyAssessment_teacherId_status_idx" ON "MonthlyAssessment"("teacherId", "status");

-- CreateIndex
CREATE INDEX "MonthlyAssessment_courseId_cycleStart_idx" ON "MonthlyAssessment"("courseId", "cycleStart");

-- CreateIndex
CREATE INDEX "MonthlyAssessment_studentId_publishedAt_idx" ON "MonthlyAssessment"("studentId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAssessment_studentId_courseId_cycleStart_key" ON "MonthlyAssessment"("studentId", "courseId", "cycleStart");

-- CreateIndex
CREATE INDEX "MonthlyAssessmentScore_assessmentId_idx" ON "MonthlyAssessmentScore"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentFeedback_assessmentId_idx" ON "AssessmentFeedback"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentFeedback_reviewedAt_idx" ON "AssessmentFeedback"("reviewedAt");

-- CreateIndex
CREATE INDEX "StudentRanking_courseId_cycleStart_rank_idx" ON "StudentRanking"("courseId", "cycleStart", "rank");

-- CreateIndex
CREATE INDEX "StudentRanking_studentId_idx" ON "StudentRanking"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentRanking_courseId_cycleStart_studentId_key" ON "StudentRanking"("courseId", "cycleStart", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "RankingBadgeConfig_rule_key" ON "RankingBadgeConfig"("rule");

-- CreateIndex
CREATE INDEX "RankingBadge_studentId_idx" ON "RankingBadge"("studentId");

-- CreateIndex
CREATE INDEX "RankingBadge_courseId_cycleStart_idx" ON "RankingBadge"("courseId", "cycleStart");

-- CreateIndex
CREATE UNIQUE INDEX "RankingBadge_studentId_courseId_rule_cycleStart_key" ON "RankingBadge"("studentId", "courseId", "rule", "cycleStart");

-- CreateIndex
CREATE INDEX "StaffMeeting_startsAt_status_idx" ON "StaffMeeting"("startsAt", "status");

-- CreateIndex
CREATE INDEX "StaffMeeting_status_startsAt_idx" ON "StaffMeeting"("status", "startsAt");

-- CreateIndex
CREATE INDEX "StaffMeeting_organizerId_idx" ON "StaffMeeting"("organizerId");

-- CreateIndex
CREATE INDEX "StaffMeeting_type_startsAt_idx" ON "StaffMeeting"("type", "startsAt");

-- CreateIndex
CREATE INDEX "StaffMeeting_seriesId_idx" ON "StaffMeeting"("seriesId");

-- CreateIndex
CREATE INDEX "StaffMeetingParticipant_userId_status_idx" ON "StaffMeetingParticipant"("userId", "status");

-- CreateIndex
CREATE INDEX "StaffMeetingParticipant_meetingId_status_idx" ON "StaffMeetingParticipant"("meetingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMeetingParticipant_meetingId_userId_key" ON "StaffMeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "MeetingActionItem_assignedToId_status_idx" ON "MeetingActionItem"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "MeetingActionItem_meetingId_idx" ON "MeetingActionItem"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingActionItem_status_dueDate_idx" ON "MeetingActionItem"("status", "dueDate");

-- CreateIndex
CREATE INDEX "MeetingAttachment_meetingId_idx" ON "MeetingAttachment"("meetingId");

-- CreateIndex
CREATE INDEX "StaffMeetingSeries_active_type_idx" ON "StaffMeetingSeries"("active", "type");

-- CreateIndex
CREATE INDEX "MeetingAuditLog_meetingId_createdAt_idx" ON "MeetingAuditLog"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingAuditLog_action_createdAt_idx" ON "MeetingAuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTransfer" ADD CONSTRAINT "StudentTransfer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRequest" ADD CONSTRAINT "SubscriptionRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRequest" ADD CONSTRAINT "SubscriptionRequest_requestedPackageId_fkey" FOREIGN KEY ("requestedPackageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionNextCycle" ADD CONSTRAINT "SubscriptionNextCycle_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionNextCycle" ADD CONSTRAINT "SubscriptionNextCycle_nextPackageId_fkey" FOREIGN KEY ("nextPackageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentActivity" ADD CONSTRAINT "StudentActivity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SubscriptionModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_feePlanId_fkey" FOREIGN KEY ("feePlanId") REFERENCES "FeePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSubscription" ADD CONSTRAINT "StudentSubscription_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSubscription" ADD CONSTRAINT "StudentSubscription_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "SubscriptionModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSubscription" ADD CONSTRAINT "StudentSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAttendee" ADD CONSTRAINT "ClassAttendee_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAttendee" ADD CONSTRAINT "ClassAttendee_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchStudent" ADD CONSTRAINT "BatchStudent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchStudent" ADD CONSTRAINT "BatchStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveImpact" ADD CONSTRAINT "LeaveImpact_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveImpact" ADD CONSTRAINT "LeaveImpact_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAuditLog" ADD CONSTRAINT "LeaveAuditLog_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherRegistration" ADD CONSTRAINT "TeacherRegistration_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTrial" ADD CONSTRAINT "LeadTrial_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "NotificationBroadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePlanComponent" ADD CONSTRAINT "FeePlanComponent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FeePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeAssignment" ADD CONSTRAINT "StudentFeeAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "FeePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scholarship" ADD CONSTRAINT "Scholarship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollConfig" ADD CONSTRAINT "PayrollConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleWidgetSetting" ADD CONSTRAINT "RoleWidgetSetting_widgetKey_fkey" FOREIGN KEY ("widgetKey") REFERENCES "DashboardWidget"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWidgetLayout" ADD CONSTRAINT "UserWidgetLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWidgetLayout" ADD CONSTRAINT "UserWidgetLayout_widgetKey_fkey" FOREIGN KEY ("widgetKey") REFERENCES "DashboardWidget"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "GradingScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTemplate" ADD CONSTRAINT "AssessmentTemplate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTemplate" ADD CONSTRAINT "AssessmentTemplate_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTemplate" ADD CONSTRAINT "AssessmentTemplate_gradingScaleId_fkey" FOREIGN KEY ("gradingScaleId") REFERENCES "GradingScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCriterion" ADD CONSTRAINT "AssessmentCriterion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssessmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAssessment" ADD CONSTRAINT "MonthlyAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAssessment" ADD CONSTRAINT "MonthlyAssessment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAssessment" ADD CONSTRAINT "MonthlyAssessment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssessmentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAssessmentScore" ADD CONSTRAINT "MonthlyAssessmentScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "MonthlyAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentFeedback" ADD CONSTRAINT "AssessmentFeedback_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "MonthlyAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentRanking" ADD CONSTRAINT "StudentRanking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentRanking" ADD CONSTRAINT "StudentRanking_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingBadge" ADD CONSTRAINT "RankingBadge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingBadge" ADD CONSTRAINT "RankingBadge_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMeeting" ADD CONSTRAINT "StaffMeeting_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "StaffMeetingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMeetingParticipant" ADD CONSTRAINT "StaffMeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "StaffMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMeetingParticipant" ADD CONSTRAINT "StaffMeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionItem" ADD CONSTRAINT "MeetingActionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "StaffMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttachment" ADD CONSTRAINT "MeetingAttachment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "StaffMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAuditLog" ADD CONSTRAINT "MeetingAuditLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "StaffMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

