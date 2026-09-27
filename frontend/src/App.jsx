import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import {
  AuthProvider,
  useAuth,
} from "./context/AuthContext";

import ProtectedRoute from "./components/ProtectedRoute";


/* =====================================================
   LAYOUTS
===================================================== */

import PatientLayout from "./components/PatientLayout";
import FamilyLayout from "./components/FamilyLayout";
import DoctorLayout from "./components/DoctorLayout";


/* =====================================================
   AUTH
===================================================== */

import Login from "./pages/Login";
import Register from "./pages/Register";


/* =====================================================
   PATIENT
===================================================== */

import PatientDashboard from "./pages/patient/PatientDashboard";
import PatientConnections from "./pages/patient/PatientConnections";
import PatientMedications from "./pages/patient/PatientMedications";
import PatientHistory from "./pages/patient/PatientHistory";

import DemoControl from "./pages/demo/DemoControl";


/* =====================================================
   FAMILY
===================================================== */

import FamilyDashboard from "./pages/family/FamilyDashboard";
import FamilyConnections from "./pages/family/FamilyConnections";
import FamilyPatientView from "./pages/family/FamilyPatientView";
import FamilyHistory from "./pages/family/FamilyHistory";
import FamilyMedications from "./pages/family/FamilyMedications";


/* =====================================================
   DOCTOR
===================================================== */

import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import DoctorPatients from "./pages/doctor/DoctorPatients";
import DoctorPatientView from "./pages/doctor/DoctorPatientView";
import DoctorPrescriptions from "./pages/doctor/DoctorPrescriptions";
import DoctorAlerts from "./pages/doctor/DoctorAlerts";
import DoctorHistory from "./pages/doctor/DoctorHistory";
import DoctorMedications from "./pages/doctor/DoctorMedications";


/* =====================================================
   HOME REDIRECT
===================================================== */

function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="center-screen">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (user.role === "PATIENT") {
    return (
      <Navigate
        to="/patient"
        replace
      />
    );
  }

  if (user.role === "FAMILY") {
    return (
      <Navigate
        to="/family"
        replace
      />
    );
  }

  if (user.role === "DOCTOR") {
    return (
      <Navigate
        to="/doctor"
        replace
      />
    );
  }

  return (
    <Navigate
      to="/login"
      replace
    />
  );
}


/* =====================================================
   PLACEHOLDER PAGE
===================================================== */

function PlaceholderPage({
  eyebrow = "RESPICARE",
  title,
  description,
}) {
  return (
    <div className="placeholder-page">

      <p className="page-eyebrow">
        {eyebrow}
      </p>

      <h1>{title}</h1>

      <p>{description}</p>

    </div>
  );
}


/* =====================================================
   APPLICATION ROUTES
===================================================== */

function AppRoutes() {
  return (
    <Routes>

      {/* =================================================
          ROOT
      ================================================= */}

      <Route
        path="/"
        element={<HomeRedirect />}
      />


      {/* =================================================
          AUTH
      ================================================= */}

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />


      {/* =================================================
          PATIENT
      ================================================= */}

      <Route
        path="/patient"
        element={
          <ProtectedRoute roles={["PATIENT"]}>
            <PatientLayout />
          </ProtectedRoute>
        }
      >

        {/* PATIENT OVERVIEW */}

        <Route
          index
          element={<PatientDashboard />}
        />


        {/* LIVE MONITORING */}

        <Route
          path="monitoring"
          element={<PatientDashboard />}
        />


        {/* HISTORY */}

        <Route
          path="history"
          element={<PatientHistory />}
        />


        {/* CONNECTIONS */}

        <Route
          path="connections"
          element={<PatientConnections />}
        />


        {/* MEDICATIONS */}

        <Route
          path="medications"
          element={
            <PatientMedications />
          }
        />


        {/* SIMULATION */}

        <Route
          path="simulation"
          element={<DemoControl />}
        />

      </Route>


      {/* =================================================
          FAMILY
      ================================================= */}

      <Route
        path="/family"
        element={
          <ProtectedRoute roles={["FAMILY"]}>
            <FamilyLayout />
          </ProtectedRoute>
        }
      >

        {/* FAMILY OVERVIEW */}

        <Route
          index
          element={<FamilyDashboard />}
        />


        {/* MY PATIENTS / CONNECTIONS */}

        <Route
          path="connections"
          element={<FamilyConnections />}
        />


        {/* INDIVIDUAL PATIENT */}

        <Route
          path="patient/:patientId"
          element={<FamilyPatientView />}
        />


        {/* ALERTS */}

        <Route
          path="alerts"
          element={
            <PlaceholderPage
              eyebrow="PATIENT SAFETY"
              title="Respiratory Alerts"
              description="Persistent respiratory events from your connected patients will appear here."
            />
          }
        />


        {/* MEDICATIONS */}

        <Route
          path="medications"
          element={
            <FamilyMedications />
          }
        />


        {/* HISTORY */}

        <Route
          path="history"
          element={<FamilyHistory />}
        />

      </Route>


      {/* =================================================
          DOCTOR
      ================================================= */}

      <Route
        path="/doctor"
        element={
          <ProtectedRoute roles={["DOCTOR"]}>
            <DoctorLayout />
          </ProtectedRoute>
        }
      >

        {/* DOCTOR OVERVIEW */}

        <Route
          index
          element={<DoctorDashboard />}
        />


        {/* MY PATIENTS */}

        <Route
          path="patients"
          element={<DoctorPatients />}
        />


        {/* INDIVIDUAL PATIENT */}

        <Route
          path="patient/:patientId"
          element={<DoctorPatientView />}
        />


        {/* PRESCRIPTIONS */}

        <Route
          path="prescriptions"
          element={<DoctorPrescriptions />}
        />


        {/* MEDICATIONS */}

        <Route
          path="medications"
          element={
            <DoctorMedications />
          }
        />


        {/* REAL CLINICAL ALERTS */}

        <Route
          path="alerts"
          element={<DoctorAlerts />}
        />


        {/* REAL MONITORING HISTORY */}

        <Route
          path="history"
          element={<DoctorHistory />}
        />

      </Route>


      {/* =================================================
          UNKNOWN ROUTE
      ================================================= */}

      <Route
        path="*"
        element={<HomeRedirect />}
      />

    </Routes>
  );
}


/* =====================================================
   APP
===================================================== */

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}