# Joineazy – Role-Based Course, Group & Assignment Management System (Task 2)

Joineazy is a full-stack web application built with React, Tailwind CSS, Node.js, Express, and PostgreSQL. It streamlines course enrollment, project group formation, individual and group assignment workflows, group-leader-only submission acknowledgments, and real-time professor analytics.

## Live Links

- **Live Application:** https://join-easy-zeta.vercel.app/login
- **GitHub Repository:** https://github.com/CrshIVam16/JoinEasy
- **Demo Video:** Add your Task 2 walkthrough video link here.

---

## Table of Contents

1. [Overview & Core Features](#1-overview--core-features)
2. [UI/UX Design Choices](#2-uiux-design-choices)
3. [Tech Stack](#3-tech-stack)
4. [System Architecture & Data Flow](#4-system-architecture--data-flow)
5. [Database Schema & ER Diagram](#5-database-schema--er-diagram)
6. [Project Structure](#6-project-structure)
7. [Setup & Installation](#7-setup--installation)
8. [API Endpoint Reference](#8-api-endpoint-reference)
9. [Screenshots & UI Flow](#9-screenshots--ui-flow)

---

## 1. Overview & Core Features

Joineazy provides dedicated, role-protected workspaces for **Students** and **Professors** using JWT authentication.

### Student Role (`student`)

- **Authentication & Student ID:** Register and log in using JWT-based authentication with client-side validation, loading states, and error feedback. Each student receives a unique human-readable code (`STU-XXXX`).
- **Enrolled Courses Grid:** View enrolled courses in a responsive card grid displaying course code, title, instructor, and assignment count. Students can enroll using a course code or UUID and click any course card to filter its assignments.
- **Group Management & Leadership:** Create project groups (automatically assigning the creator as the **Group Leader**), add teammates using their email or `STU-XXXX`, transfer leadership, and remove members.
- **Individual & Group Assignments:** View assignments labeled by course and submission type (`Individual` or `Group`), along with deadlines, status badges, and animated progress bars.
- **Group-Leader-Only Acknowledgment:**
  - For **Group** assignments, only the Group Leader can acknowledge a group submission. Other members see a notice explaining that acknowledgment is restricted to the leader.
  - Once acknowledged by the leader, the `Acknowledged` status is reflected across all members of that group.
  - For **Individual** assignments, each student submits and acknowledges their own work independently.

### Professor Role (`professor` / `admin`)

- **Course & Enrollment Management:** Create courses with a code, title, and description. Enroll students using their email, `STU-XXXX`, or UUID, and monitor enrolled student counts and submission totals per course.
- **Assignment Management:** Create, edit, and delete assignments linked to specific courses, with `Individual` or `Group` submission types, deadlines, and target scopes.
- **Submission Monitoring & Filtering:** Filter submissions by course and status (`All`, `Pending`, `Submitted`, `Acknowledged`) with stacked progress bars and per-group or per-student status breakdowns.

---

## 2. UI/UX Design Choices

- **Role-Specific Workspaces:** Separate `/student` and `/professor` dashboards prevent interface clutter and display role-relevant actions immediately after login.
- **Responsive Card Grids:** Enrolled courses, taught courses, and assignment trackers adapt across desktop, tablet, and mobile screens using Tailwind CSS grid layouts.
- **Clear Status & Permission Hierarchy:** Color-coded badges (`Group`, `Individual`, `Pending`, `Submitted`, `Acknowledged`, `Leader`) and stacked progress bars communicate progress at a glance.
- **Explicit Permission Feedback:** Inline notices explain why only group leaders can acknowledge group submissions.
- **Immediate Visual Feedback:** Form validation messages, button loading states, toast alerts, and smooth progress-bar transitions make application interactions clear and predictable.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router, Axios, Lucide Icons |
| Backend | Node.js, Express.js, ES Modules |
| Database | PostgreSQL 15+ (Neon Serverless PostgreSQL) |
| Authentication | JSON Web Tokens (JWT), bcryptjs |
| Database Driver | `pg` (node-postgres) |
| Containerization | Docker, Docker Compose |

---

## 4. System Architecture & Data Flow

Joineazy follows a three-tier architecture consisting of a React frontend, an Express.js backend, and a PostgreSQL database.

### Architecture Overview

```text
+---------------------------------------------------------------+
|                    CLIENT (React + Vite)                      |
|                                                               |
|  - AuthPage (Login / Register with validation & loaders)      |
|  - StudentDashboard (Courses, Groups, Leader Acknowledgment)  |
|  - ProfessorDashboard (Courses, Assignments, Status Filters)  |
+------------------------------+--------------------------------+
                               |
                               |
                   HTTPS / REST JSON (Bearer JWT)
                               |
                               v
+---------------------------------------------------------------+
|                  API SERVER (Node.js + Express)               |
|                                                               |
|  - JWT Authentication & Role Authorization Middleware         |
|  - Controllers (Auth, Courses, Groups, Assignments,           |
|                 Submissions & Acknowledgment)                 |
|  - Transactional SQL Queries (`pg` Pool)                      |
+------------------------------+--------------------------------+
                               |
                               |
                          TLS / TCP (pg)
                               |
                               v
+---------------------------------------------------------------+
|                    DATABASE (PostgreSQL)                      |
|                                                               |
|  - users                - courses                             |
|  - course_enrollments   - groups                              |
|  - group_members        - assignments                         |
|  - assignment_groups    - submissions                         |
+---------------------------------------------------------------+
```

### End-to-End Workflow

1. **Course & Assignment Setup:** A professor creates courses, enrolls students (or shares the course code/UUID), and posts Individual or Group assignments linked to each course.
2. **Team & Enrollment Setup:** Students enroll in courses, form groups, and add teammates using email addresses or `STU-XXXX` codes.
3. **Submission & Leader Acknowledgment:** Students submit their work. For group assignments, the backend checks `groups.leader_id === req.user.id` before allowing acknowledgment across the entire group.
4. **Live Analytics:** The professor dashboard aggregates course, assignment, group, and student statuses with real-time filters.

---

## 5. Database Schema & ER Diagram

The database uses UUID primary keys, foreign-key constraints, and unique indexes across eight relational tables, defined in `backend/schema.sql`.

### Database Tables

| Table | Description |
|---|---|
| `users` | Stores user profiles, hashed passwords, roles (`student`, `professor`, `admin`), and `student_code`. |
| `courses` | Stores course details such as code, title, and description, linked to `professor_id`. |
| `course_enrollments` | Many-to-many join table associating students with enrolled courses. |
| `groups` | Stores project groups, their creators (`created_by`), and leaders (`leader_id`). |
| `group_members` | Many-to-many join table connecting students with groups. |
| `assignments` | Stores assignment metadata, `course_id`, `due_date`, `target_type`, and `submission_type`. |
| `assignment_groups` | Maps group-targeted assignments to specific groups. |
| `submissions` | Tracks individual or group submissions, status, confirming users, acknowledgment details, and timestamps. |

### Entity Relationship Diagram

```text
+--------------------+       +--------------------+       +--------------------+
|       users        |       | course_enrollments |       |      courses       |
+--------------------+       +--------------------+       +--------------------+
| PK id (UUID)       |<------| FK student_id      |   +-->| PK id (UUID)       |
| name               |       | FK course_id       |---+   | code (UNIQUE)      |
| email (UNIQUE)     |       | enrolled_at        |       | title              |
| password_hash      |       +--------------------+       | description        |
| role               |                                    | FK professor_id    |
| student_code       |       +--------------------+       | created_at         |
| created_at         |       |   group_members    |       +--------------------+
+--------------------+       +--------------------+                |
         |                   | FK user_id         |                |
         +------------------>| FK group_id        |---+            |
         |                   | joined_at          |   |            |
         |                   +--------------------+   v            |
         |                                        +--------------------+
         |                                        |       groups       |
         |                                        +--------------------+
         |                                        | PK id (UUID)       |
         |                                        | name               |
         |                                        | FK created_by      |
         |                                        | FK leader_id       |
         |                                        +--------------------+
         |                                                 |
         v                                                 v
+--------------------+       +--------------------+       +--------------------+
|    assignments     |       |    submissions     |       | assignment_groups  |
+--------------------+       +--------------------+       +--------------------+
| PK id (UUID)       |<------| FK assignment_id   |   +-->| FK assignment_id   |
| title              |       | FK group_id        |---+   | FK group_id        |
| description        |       | FK student_id      |       +--------------------+
| due_date           |       | FK confirmed_by    |
| submission_type    |       | status             |
| target_type        |       | FK acknowledged_by |
| FK course_id       |       | acknowledged_at    |
| FK created_by      |       | submitted_at       |
+--------------------+       +--------------------+
```

---

## 6. Project Structure

```text
JoinEasy/
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── schema.sql
│   │
│   └── src/
│       ├── app.js
│       ├── server.js
│       │
│       ├── config/
│       │   └── db.js
│       │
│       ├── middleware/
│       │   └── auth.js
│       │
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── courseController.js
│       │   ├── groupController.js
│       │   ├── assignmentController.js
│       │   └── submissionController.js
│       │
│       ├── routes/
│       │   ├── authRoutes.js
│       │   ├── courseRoutes.js
│       │   ├── groupRoutes.js
│       │   ├── assignmentRoutes.js
│       │   └── submissionRoutes.js
│       │
│       └── utils/
│           ├── httpError.js
│           └── validation.js
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   │
│   └── src/
│       ├── api/
│       │   └── axios.js
│       │
│       ├── context/
│       │   └── AuthContext.jsx
│       │
│       ├── components/
│       │   └── Navbar.jsx
│       │
│       └── pages/
│           ├── AuthPage.jsx
│           ├── StudentDashboard.jsx
│           └── ProfessorDashboard.jsx
│
├── docker-compose.yml
└── README.md
```

---

## 7. Setup & Installation

Follow these instructions to run Joineazy locally.

### Prerequisites

Make sure you have the following installed:

- Node.js v20 or later
- npm
- PostgreSQL 15+ (local installation or Neon Serverless PostgreSQL)
- Docker and Docker Compose (optional)

### Step 1: Clone the Repository

```bash
git clone https://github.com/CrshIVam16/JoinEasy.git
cd JoinEasy
```

### Step 2: Initialize the Database

Run the SQL script located at:

```text
backend/schema.sql
```

Execute it in your PostgreSQL database or Neon SQL Editor to create the required tables, constraints, and indexes.

### Step 3: Configure and Start the Backend

Navigate to the backend directory:

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` directory:

```env
PORT=5000
DATABASE_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=require
JWT_SECRET=replace_with_a_strong_secret_key
```

Replace the database credentials and JWT secret with your actual values.

Start the backend server:

```bash
npm run dev
```

Verify the backend using:

```text
http://localhost:5000/api/health
```

### Step 4: Configure and Start the Frontend

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend
npm install
```

Optionally, create a `.env` file inside the `frontend` directory:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend development server:

```bash
npm run dev
```

Open the application in your browser:

```text
http://localhost:5173
```

---

## 8. API Endpoint Reference

All protected routes require JWT authentication through the following HTTP header:

```http
Authorization: Bearer <token>
```

### Authentication (`/api/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register a student or professor account. |
| POST | `/api/auth/login` | Public | Authenticate and return a JWT with user profile information. |
| GET | `/api/auth/me` | Authenticated | Fetch the currently authenticated user's details. |

### Courses (`/api/courses`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/courses` | Authenticated | List taught courses (Professor) or enrolled courses (Student). |
| POST | `/api/courses` | Professor | Create a new course with code, title, and description. |
| POST | `/api/courses/:courseId/enroll` | Authenticated | Enroll a student using email, `STU-XXXX`, or UUID. |

### Groups (`/api/groups`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/groups` | Student | Create a group and set its creator as `leader_id`. |
| GET | `/api/groups/my` | Student | List groups the student belongs to, including member details. |
| GET | `/api/groups` | Professor | List all groups and their members. |
| POST | `/api/groups/:groupId/members` | Student | Add a teammate using email or `STU-XXXX`. |
| PATCH | `/api/groups/:groupId/leader` | Student | Transfer group leadership to another member. |
| DELETE | `/api/groups/:groupId/members/:userId` | Student | Remove a group member (leader/creator only). |

### Assignments (`/api/assignments`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/assignments` | Professor | Create an individual or group assignment linked to a course. |
| PUT | `/api/assignments/:id` | Professor | Update assignment details, course link, or target groups. |
| DELETE | `/api/assignments/:id` | Professor | Delete an assignment and its dependent records. |
| GET | `/api/assignments` | Authenticated | Retrieve assignments filtered by role and optional `?courseId=`. |

### Submissions & Acknowledgments (`/api/submissions`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/submissions/confirm` | Student | Submit an individual or group assignment. |
| POST | `/api/submissions/acknowledge` | Student | Acknowledge a submission (restricted to the group leader for group assignments). |
| GET | `/api/submissions/analytics` | Professor | Retrieve KPIs and submissions filterable by `?courseId=` and `?status=`. |

---