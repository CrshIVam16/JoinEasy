-- Joineazy Task 2 PostgreSQL schema. This file documents the Neon schema;
-- it is not run automatically by the application.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('student', 'professor', 'admin')),
  student_code VARCHAR(40) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  leader_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  professor_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (professor_id, code)
);

CREATE TABLE course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, student_id)
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  onedrive_link TEXT,
  target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('all', 'groups')),
  submission_type VARCHAR(10) NOT NULL DEFAULT 'group'
    CHECK (submission_type IN ('individual', 'group')),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assignment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  UNIQUE (assignment_id, group_id)
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  confirmed_by UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'acknowledged')),
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  step_one_intent BOOLEAN NOT NULL DEFAULT FALSE,
  step_two_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  submission_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((group_id IS NOT NULL AND student_id IS NULL)
    OR (group_id IS NULL AND student_id IS NOT NULL))
);

CREATE UNIQUE INDEX submissions_assignment_group_unique
  ON submissions(assignment_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX submissions_assignment_student_unique
  ON submissions(assignment_id, student_id) WHERE student_id IS NOT NULL;

CREATE INDEX group_members_user_id_idx ON group_members(user_id);
CREATE INDEX assignment_groups_group_id_idx ON assignment_groups(group_id);
CREATE INDEX course_enrollments_student_id_idx ON course_enrollments(student_id);
CREATE INDEX assignments_course_id_idx ON assignments(course_id);
CREATE INDEX submissions_group_id_idx ON submissions(group_id);
CREATE INDEX submissions_student_id_idx ON submissions(student_id);
