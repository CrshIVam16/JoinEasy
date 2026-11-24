
# Joineazy – Student, Group & Assignment Management System

Joineazy is a role-based full-stack web application designed to simplify student group management, assignment distribution, and submission tracking.

Students can create project groups, manage teammates, access OneDrive assignment links, and confirm submissions through a two-step verification process. Professors (admins) can create and manage assignments, target specific groups or all students, and monitor submission progress through an analytics dashboard.

---

## Table of Contents

1. Overview & Core Features
2. Tech Stack
3. System Architecture & Data Flow
4. Database Schema & ER Diagram
5. Project Structure
6. Setup & Installation
7. API Endpoint Reference
8. Key Design & Deployment Decisions

---

## 1. Overview & Core Features

Joineazy provides separate functionalities for students and professors (admins), ensuring efficient collaboration and assignment management.

### Student Role (`student`)

- **Authentication & Student ID:** Register and log in using JWT-based authentication. Every student automatically receives a unique, human-readable student ID (`STU-XXXX`) alongside their email address.
- **Group Management:** Create project groups, add classmates using their email or `STU-XXXX` identifier, view team members, and remove members (group creator only).
- **Assignment Discovery & OneDrive Access:** View assignments targeted at all students or specifically assigned to the student's groups, with direct access to external OneDrive submission links.
- **Two-Step Submission Verification:**
  1. **Step 1 – Upload Declaration:** Confirm that the group's deliverable has been uploaded to the provided OneDrive link.
  2. **Step 2 – Final Confirmation:** Select the target group (if enrolled in multiple groups), optionally provide a submission note, and confirm the submission.
- **Submission Tracking:** Store submission details, including the confirming student's ID (`confirmed_by`) and submission timestamp (`submitted_at`).
- **Visual Progress Tracking:** View progress bars and completion counters showing assigned, completed, and pending assignments across groups.

### Professor / Admin Role (`admin`)

- **Assignment Management:** Create, update, and delete assignments with a title, description, due date, OneDrive submission URL, and target scope.
- **Flexible Assignment Targeting:** Assign work to all students or select specific groups.
- **Analytics Dashboard:** Monitor key metrics, including:
  - Total assignments
  - Total groups
  - Total submissions
  - Overall completion percentage
- **Group-Wise & Student-Wise Tracking:** View submission statuses for target groups, including student names, student IDs, and submitted or pending status.
- **Assignment Progress:** Monitor completion percentages and submission progress for individual assignments.

---

## 2. Tech Stack

| Layer            | Technology                                                         |
| ---------------- | ------------------------------------------------------------------ |
| Frontend         | React 19, Vite, Tailwind CSS v4, React Router, Axios, Lucide Icons |
| Backend          | Node.js, Express.js, ES Modules                                    |
| Database         | PostgreSQL 15+, Neon Serverless PostgreSQL                         |
| Authentication   | JSON Web Tokens (JWT), bcryptjs                                    |
| Database Driver  | pg (node-postgres)                                                 |
| Containerization | Docker, Docker Compose                                             |

---

## 3. System Architecture & Data Flow

Joineazy follows a three-tier architecture consisting of a React frontend, an Express.js backend, and a PostgreSQL database.

### Architecture Overview

```
+---------------------------------------------------------------+
|                    CLIENT (React + Vite)                      |
|                                                               |
|  - AuthPage (Login / Register)                                |
|  - StudentDashboard (Groups, Assignments, Submissions)        |
|  - AdminDashboard (Assignment Management, Analytics)          |
+------------------------------+--------------------------------+
                               |
                               |
                     HTTPS / REST JSON
                       Bearer JWT
                               |
                               v
+---------------------------------------------------------------+
|                  API SERVER (Node.js + Express)               |
|                                                               |
|  - CORS & JSON Body Parser                                    |
|  - JWT Authentication & Role-Based Authorization              |
|  - Controllers (Auth, Groups, Assignments, Submissions)       |
|  - Transactional SQL Queries                                  |
|  - PostgreSQL Connection Pool                                 |
+------------------------------+--------------------------------+
                               |
                               |
                       TLS / TCP (pg)
                               |
                               v
+---------------------------------------------------------------+
|                    DATABASE (PostgreSQL)                      |
|                                                               |
|  - users                                                     |
|  - groups                                                    |
|  - group_members                                             |
|  - assignments                                               |
|  - assignment_groups                                         |
|  - submissions                                               |
+---------------------------------------------------------------+
```

### End-to-End Submission Flow

1. **Assignment Creation:** An admin creates an assignment, provides a OneDrive submission URL, and selects either all groups or specific target groups.
2. **Group Formation:** Students create project groups and add teammates using their email addresses or student IDs.
3. **File Upload:** Students upload their group's deliverable to the provided OneDrive link.
4. **Submission Confirmation:** A student completes the two-step submission verification process.
5. **Backend Validation:** The backend validates group membership, assignment eligibility, and both confirmation flags within a PostgreSQL transaction.
6. **Submission Recording:** The system stores the confirmation details and submission timestamp.
7. **Admin Monitoring:** The admin dashboard displays updated submission statuses, group details, and completion percentages.

---

## 4. Database Schema & ER Diagram

The relational database schema is defined in `backend/schema.sql`.

It uses UUID primary keys, foreign-key relationships, cascading operations, and composite UNIQUE constraints to maintain data integrity and prevent duplicate memberships or submissions.

### Database Tables

| Table               | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `users`             | Stores user information, authentication details, roles, and student IDs.       |
| `groups`            | Stores project group details and creator information.                          |
| `group_members`     | Manages the many-to-many relationship between students and groups.             |
| `assignments`       | Stores assignment details, deadlines, OneDrive links, and creator information. |
| `assignment_groups` | Connects assignments with their targeted groups.                               |
| `submissions`       | Records group submission confirmations, notes, and timestamps.                 |

### Entity Relationship Diagram

```
+--------------------+       +--------------------+       +--------------------+
|       users        |       |   group_members    |       |       groups       |
+--------------------+       +--------------------+       +--------------------+
| PK id (UUID)       |<------| FK user_id         |       | PK id (UUID)       |
| name               |       | FK group_id        |------>| name               |
| email (UNIQUE)     |       | joined_at          |       | FK created_by      |
| password_hash      |       +--------------------+       | created_at         |
| role               |                                    +--------------------+
| student_code       |
| created_at         |
+--------------------+
         |
         | created_by / confirmed_by
         |
         v
+--------------------+       +--------------------+
|    assignments    |       | assignment_groups  |
+--------------------+       +--------------------+
| PK id (UUID)       |<------| FK assignment_id   |
| title              |       | FK group_id        |
| description        |       +--------------------+
| due_date           |
| onedrive_link      |       +--------------------+
| target_type        |       |    submissions     |
| FK created_by      |       +--------------------+
| created_at         |<------| FK assignment_id   |
+--------------------+       | FK group_id        |
                             | FK confirmed_by    |
                             | step_one_intent    |
                             | step_two_confirmed |
                             | submission_note    |
                             | submitted_at       |
                             +--------------------+
```

---

## 5. Project Structure

```
joineazy-task1/
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
│       │   ├── groupController.js
│       │   ├── assignmentController.js
│       │   └── submissionController.js
│       │
│       ├── routes/
│       │   ├── authRoutes.js
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
│           └── AdminDashboard.jsx
│
├── docker-compose.yml
└── README.md
```

---

## 6. Setup & Installation

Follow these instructions to run Joineazy locally or using Docker.

### Prerequisites

Make sure you have the following installed:

- Node.js v20 or later
- npm
- PostgreSQL 15+ (local installation or a cloud database such as Neon)
- Docker and Docker Compose (optional, for containerized execution)

### Option A: Run Locally (Development Mode)

#### Step 1: Clone the Repository

```
git clone https://github.com/CrshIVam16/JoinEasy.git
cd joineazy-task1
```

#### Step 2: Initialize the Database

Execute the SQL script located at:

```
backend/schema.sql
```

Run it against your PostgreSQL database to create the required tables, constraints, and indexes.

#### Step 3: Configure the Backend

Navigate to the backend directory:

```
cd backend
npm install
```

Create a `.env` file inside the `backend` directory:

```
PORT=5000
DATABASE_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=require
JWT_SECRET=replace_with_a_strong_secret_key
```

Replace the database credentials and JWT secret with your actual values.

#### Step 4: Start the Backend Server

```
npm run dev
```

The backend API should now be available at:

```
http://localhost:5000
```

Verify the server using the health-check endpoint:

```
http://localhost:5000/api/health
```

#### Step 5: Configure and Start the Frontend

Open a new terminal and navigate to the frontend directory:

```
cd frontend
npm install
```

If you are using a non-default API URL, create a `.env` file inside the `frontend` directory:

```
VITE_API_URL=http://localhost:5000/api
```

Start the frontend development server:

```
npm run dev
```

Open the application in your browser:

```
http://localhost:5173
```

### Option B: Run Using Docker Compose

Make sure Docker and Docker Compose are installed and the backend environment variables are configured.

From the project root directory, run:

```
docker compose up --build
```

This builds and starts the application containers.

Default access URLs:

| Service                  | URL                                                                  |
| ------------------------ | -------------------------------------------------------------------- |
| Frontend                 | [http://localhost:5173](http://localhost:5173)                       |
| Backend API Health Check | [http://localhost:5000/api/health](http://localhost:5000/api/health) |

The actual port mappings depend on your `docker-compose.yml` configuration.

To stop the containers:

```
docker compose down
```

---

## 7. API Endpoint Reference

All protected API routes require JWT authentication through the following HTTP header:

```
Authorization: Bearer <token>
```

### Authentication (`/api/auth`)

| Method | Endpoint             | Access        | Description                                                           |
| ------ | -------------------- | ------------- | --------------------------------------------------------------------- |
| POST   | `/api/auth/register` | Public        | Register a student or admin. Student IDs are generated automatically. |
| POST   | `/api/auth/login`    | Public        | Authenticate a user and return a JWT with profile information.        |
| GET    | `/api/auth/me`       | Authenticated | Retrieve the currently logged-in user's profile.                      |

### Groups (`/api/groups`)

| Method | Endpoint                               | Access  | Description                                                       |
| ------ | -------------------------------------- | ------- | ----------------------------------------------------------------- |
| POST   | `/api/groups`                          | Student | Create a new group and automatically enroll its creator.          |
| GET    | `/api/groups/my`                       | Student | Retrieve groups the student belongs to, including member details. |
| GET    | `/api/groups`                          | Admin   | Retrieve all groups and their member details.                     |
| POST   | `/api/groups/:groupId/members`         | Student | Add a student using their email or `STU-XXXX` code.               |
| DELETE | `/api/groups/:groupId/members/:userId` | Student | Remove a group member (group creator only).                       |

### Assignments (`/api/assignments`)

| Method | Endpoint               | Access        | Description                                                                    |
| ------ | ---------------------- | ------------- | ------------------------------------------------------------------------------ |
| POST   | `/api/assignments`     | Admin         | Create an assignment targeting all students or specific groups.                |
| PUT    | `/api/assignments/:id` | Admin         | Update assignment details or target groups.                                    |
| DELETE | `/api/assignments/:id` | Admin         | Delete an assignment and its associated target and submission records.         |
| GET    | `/api/assignments`     | Authenticated | Retrieve role-specific assignments and associated analytics or group statuses. |

### Submissions & Analytics (`/api/submissions`)

| Method | Endpoint                     | Access  | Description                                                                 |
| ------ | ---------------------------- | ------- | --------------------------------------------------------------------------- |
| POST   | `/api/submissions/confirm`   | Student | Record a group submission through the two-step verification process.        |
| GET    | `/api/submissions/analytics` | Admin   | Retrieve dashboard KPIs, assignment breakdowns, and group completion rates. |

---

## 8. Key Design & Deployment Decisions

### 1. Group-Scoped Submission Model

Submissions are tracked using the combination of `assignment_id` and `group_id`, rather than individual student submissions.

A unique constraint:

```
UNIQUE (assignment_id, group_id)
```

ensures that each group has only one submission record for a particular assignment.

Since students collaborate on a shared deliverable, any eligible group member can confirm the submission. The system also records `confirmed_by` and `submitted_at` to maintain individual accountability.

### 2. Transactional Data Integrity

Operations involving multiple database tables use explicit PostgreSQL transactions:

```
BEGIN;
COMMIT;
ROLLBACK;
```

Examples include:

- Creating a group and enrolling its creator.
- Updating assignment targets in `assignment_groups`.
- Confirming a two-step group submission.

This prevents partially completed database operations and helps maintain consistent data.

### 3. SQL CTE-Driven Analytics

The `/api/submissions/analytics` endpoint uses Common Table Expressions (CTEs) to calculate assignment targets and submission statistics.

For example:

```
WITH targets AS (...)
```

This approach dynamically resolves assignments targeting all groups or specific groups and calculates completion percentages using the correct target counts.

### 4. Stateless JWT Authentication

The application uses signed JSON Web Tokens for authentication.

Route-level middleware handles:

- JWT verification.
- User authentication.
- Role-based authorization.
- Access restrictions for student and admin routes.

This keeps authentication separate from business logic and supports a scalable backend architecture.

### 5. Docker-Based Deployment

Docker and Docker Compose are used to containerize the frontend and backend services.

The configuration supports:

- Separate frontend and backend containers.
- Multi-stage frontend builds.
- Consistent development and deployment environments.
- Simplified application startup and management.

---