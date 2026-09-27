import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Pill,
  Radio,
  RefreshCw,
  Signal,
  UsersRound,
  WifiOff,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";


const getPatientId = (patient) =>
  patient?.patient_id ??
  patient?.id ??
  patient?.patient?.id ??
  null;


const getPatientName = (patient) =>
  patient?.patient_name ??
  patient?.name ??
  patient?.patient?.name ??
  "Patient";


const getPatientEmail = (patient) =>
  patient?.patient_email ??
  patient?.email ??
  patient?.patient?.email ??
  "";


function isReliableMonitoring(monitoring) {
  const quality = String(
    monitoring?.signal_quality || "UNKNOWN"
  ).toUpperCase();

  return (
    monitoring?.status === "MONITORING" &&
    monitoring?.respiratory_rate != null &&
    ![
      "UNKNOWN",
      "UNRELIABLE",
      "SIGNAL_LOSS",
      "LOST",
      "POOR",
      "MOTION_ARTIFACT",
    ].includes(quality)
  );
}


function detectorClass(state) {
  return String(state || "NORMAL")
    .toLowerCase()
    .replaceAll("_", "-");
}


function formatDoctorName(name) {
  if (!name) return "Doctor";

  if (name.toLowerCase().startsWith("dr.")) {
    return name;
  }

  return `Dr. ${name}`;
}


function timeAgo(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const seconds = Math.floor(
    (Date.now() - date.getTime()) / 1000
  );

  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);

  return `${days} day${days === 1 ? "" : "s"} ago`;
}


export default function DoctorDashboard() {
  const navigate = useNavigate();

  const { user } = useAuth();

  const [patients, setPatients] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");


  const loadDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");


      const [
        patientsResponse,
        alertsResponse,
      ] = await Promise.all([
        api.get("/connections/my-patients"),
        api.get("/alerts/my-alerts"),
      ]);


      const rawPatients = Array.isArray(patientsResponse.data)
        ? patientsResponse.data
        : [];


      const enriched = await Promise.all(
        rawPatients.map(async (patient) => {
          const patientId = getPatientId(patient);

          if (!patientId) {
            return {
              ...patient,
              monitoring: null,
              medications: [],
            };
          }


          const results = await Promise.allSettled([
            api.get(
              `/monitoring/patient/${patientId}/current`
            ),

            api.get(
              `/medications/patient/${patientId}`
            ),
          ]);


          return {
            ...patient,

            monitoring:
              results[0].status === "fulfilled"
                ? results[0].value.data
                : null,

            medications:
              results[1].status === "fulfilled" &&
              Array.isArray(results[1].value.data)
                ? results[1].value.data
                : [],
          };
        })
      );


      setPatients(enriched);

      setAlerts(
        Array.isArray(alertsResponse.data)
          ? alertsResponse.data
          : []
      );

    } catch (err) {
      console.error(err);

      setError(
        "Unable to load the clinical workspace."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);


  useEffect(() => {
    loadDashboard();

    const timer = setInterval(
      () => loadDashboard(true),
      5000
    );

    return () => clearInterval(timer);
  }, [loadDashboard]);


  const stats = useMemo(() => {
    const monitoring = patients.filter((patient) =>
      isReliableMonitoring(patient.monitoring)
    ).length;


    const activePrescriptions = patients.reduce(
      (total, patient) =>
        total +
        patient.medications.filter(
          (medicine) => medicine.is_active !== false
        ).length,
      0
    );


    const unacknowledged = alerts.filter(
      (alert) => !alert.acknowledged
    ).length;


    return {
      connected: patients.length,
      monitoring,
      waiting: Math.max(
        patients.length - monitoring,
        0
      ),
      prescriptions: activePrescriptions,
      alerts: unacknowledged,
    };
  }, [patients, alerts]);


  const attentionPatients = useMemo(() => {
    return patients
      .filter((patient) => {
        const state = String(
          patient.monitoring?.detector_state || ""
        ).toUpperCase();

        return [
          "WATCH",
          "WARNING",
          "DISTRESS",
          "SIGNAL_UNRELIABLE",
        ].includes(state);
      })
      .sort((a, b) => {
        const rank = {
          DISTRESS: 4,
          WARNING: 3,
          WATCH: 2,
          SIGNAL_UNRELIABLE: 1,
        };

        return (
          (rank[
            String(
              b.monitoring?.detector_state || ""
            ).toUpperCase()
          ] || 0) -
          (rank[
            String(
              a.monitoring?.detector_state || ""
            ).toUpperCase()
          ] || 0)
        );
      });
  }, [patients]);


  const recentAlerts = useMemo(
    () => alerts.slice(0, 5),
    [alerts]
  );


  const patientNameFromId = (patientId) => {
    const patient = patients.find(
      (item) => getPatientId(item) === patientId
    );

    return patient
      ? getPatientName(patient)
      : `Patient #${patientId}`;
  };


  if (loading) {
    return (
      <div className="doctor-page-loading">
        <Activity className="doctor-spin" size={28} />
        <span>Loading clinical workspace...</span>
      </div>
    );
  }


  return (
    <div className="doctor-dashboard">

      <header className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">
            CLINICAL OVERVIEW
          </p>

          <h1>
            Good to see you,{" "}
            {formatDoctorName(user?.name)}
          </h1>

          <p>
            Monitor connected patients, review respiratory
            changes and manage treatment from one workspace.
          </p>
        </div>

        <button
          type="button"
          className="doctor-secondary-button"
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
        >
          <RefreshCw
            size={17}
            className={refreshing ? "doctor-spin" : ""}
          />

          Refresh
        </button>
      </header>


      {error && (
        <div className="doctor-error-banner">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}


      <section className="doctor-summary-grid">

        <div className="doctor-summary-card">
          <div className="doctor-summary-icon">
            <UsersRound size={21} />
          </div>

          <div>
            <span>Connected Patients</span>
            <strong>{stats.connected}</strong>
            <small>Under your care</small>
          </div>
        </div>


        <div className="doctor-summary-card">
          <div className="doctor-summary-icon">
            <Radio size={21} />
          </div>

          <div>
            <span>Monitoring Now</span>
            <strong>{stats.monitoring}</strong>
            <small>Reliable signal available</small>
          </div>
        </div>


        <div className="doctor-summary-card">
          <div className="doctor-summary-icon">
            <BellRing size={21} />
          </div>

          <div>
            <span>Unacknowledged Alerts</span>
            <strong>{stats.alerts}</strong>
            <small>Awaiting review</small>
          </div>
        </div>


        <div className="doctor-summary-card">
          <div className="doctor-summary-icon">
            <Pill size={21} />
          </div>

          <div>
            <span>Active Prescriptions</span>
            <strong>{stats.prescriptions}</strong>
            <small>Across connected patients</small>
          </div>
        </div>

      </section>


      <section className="doctor-panel">
        <div className="doctor-panel-header">
          <div>
            <p className="doctor-section-kicker">
              PRIORITY VIEW
            </p>

            <h2>Patients Requiring Attention</h2>

            <p>
              Respiratory-pattern changes and signal
              problems are shown separately.
            </p>
          </div>
        </div>


        {attentionPatients.length === 0 ? (
          <div className="doctor-positive-empty">
            <CheckCircle2 size={23} />

            <div>
              <strong>
                No current attention items
              </strong>

              <span>
                No connected patient is currently reporting
                a detector change or unreliable signal.
              </span>
            </div>
          </div>
        ) : (
          <div className="doctor-attention-list">
            {attentionPatients.map((patient) => {
              const patientId = getPatientId(patient);

              const monitoring = patient.monitoring || {};

              const state = String(
                monitoring.detector_state ||
                "SIGNAL_UNRELIABLE"
              ).toUpperCase();

              const signalProblem =
                state === "SIGNAL_UNRELIABLE";


              return (
                <button
                  type="button"
                  key={patientId}
                  className="doctor-attention-row"
                  onClick={() =>
                    navigate(
                      `/doctor/patient/${patientId}`
                    )
                  }
                >
                  <div
                    className={`doctor-attention-state ${detectorClass(
                      state
                    )}`}
                  >
                    {signalProblem ? (
                      <WifiOff size={19} />
                    ) : (
                      <HeartPulse size={19} />
                    )}
                  </div>


                  <div className="doctor-attention-person">
                    <strong>
                      {getPatientName(patient)}
                    </strong>

                    <span>
                      {signalProblem
                        ? "Signal requires attention"
                        : monitoring.detector_reason ||
                          "Respiratory-pattern change detected"}
                    </span>
                  </div>


                  <div className="doctor-attention-metric">
                    <strong>
                      {monitoring.respiratory_rate != null
                        ? `${Math.round(
                            monitoring.respiratory_rate
                          )} BPM`
                        : "-- BPM"}
                    </strong>

                    <span>
                      {monitoring.signal_quality ||
                        "UNKNOWN"}
                    </span>
                  </div>


                  <span
                    className={`doctor-state-pill ${detectorClass(
                      state
                    )}`}
                  >
                    {state.replaceAll("_", " ")}
                  </span>


                  <ArrowRight size={18} />
                </button>
              );
            })}
          </div>
        )}
      </section>


      <section className="doctor-panel">
        <div className="doctor-panel-header">
          <div>
            <p className="doctor-section-kicker">
              PATIENT DIRECTORY
            </p>

            <h2>My Patients</h2>

            <p>
              Current monitoring status across your
              connected patients.
            </p>
          </div>

          <button
            type="button"
            className="doctor-text-button"
            onClick={() =>
              navigate("/doctor/patients")
            }
          >
            View all
            <ArrowRight size={16} />
          </button>
        </div>


        {patients.length === 0 ? (
          <div className="doctor-empty-state">
            <UsersRound size={30} />

            <h3>No connected patients</h3>

            <p>
              A patient must connect your doctor account
              using their temporary pairing code.
            </p>
          </div>
        ) : (
          <div className="doctor-patient-grid">
            {patients.slice(0, 6).map((patient) => {
              const patientId = getPatientId(patient);

              const monitoring = patient.monitoring || {};

              const live =
                isReliableMonitoring(monitoring);

              const detectorState = String(
                monitoring.detector_state ||
                (live ? "NORMAL" : "SIGNAL_UNRELIABLE")
              ).toUpperCase();


              return (
                <button
                  type="button"
                  key={patientId}
                  className="doctor-patient-card"
                  onClick={() =>
                    navigate(
                      `/doctor/patient/${patientId}`
                    )
                  }
                >
                  <div className="doctor-patient-card-top">
                    <div className="doctor-patient-avatar">
                      {getPatientName(patient)
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div className="doctor-patient-identity">
                      <strong>
                        {getPatientName(patient)}
                      </strong>

                      <span>
                        {getPatientEmail(patient) ||
                          "Connected patient"}
                      </span>
                    </div>

                    <span
                      className={`doctor-live-dot ${
                        live ? "online" : ""
                      }`}
                    />
                  </div>


                  <div className="doctor-patient-card-reading">
                    <div>
                      <span>Current rate</span>

                      <strong>
                        {live
                          ? Math.round(
                              monitoring.respiratory_rate
                            )
                          : "--"}
                      </strong>

                      <small>BPM</small>
                    </div>

                    <div>
                      <span>Signal</span>

                      <strong className="doctor-reading-text">
                        {monitoring.signal_quality ||
                          "UNKNOWN"}
                      </strong>
                    </div>
                  </div>


                  <div className="doctor-patient-card-footer">
                    <span
                      className={`doctor-state-pill ${detectorClass(
                        detectorState
                      )}`}
                    >
                      {detectorState.replaceAll("_", " ")}
                    </span>

                    <span>
                      View patient
                      <ArrowRight size={15} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>


      <section className="doctor-panel">
        <div className="doctor-panel-header">
          <div>
            <p className="doctor-section-kicker">
              LATEST EVENTS
            </p>

            <h2>Recent Clinical Alerts</h2>
          </div>

          <button
            type="button"
            className="doctor-text-button"
            onClick={() =>
              navigate("/doctor/alerts")
            }
          >
            Open alerts
            <ArrowRight size={16} />
          </button>
        </div>


        {recentAlerts.length === 0 ? (
          <div className="doctor-positive-empty">
            <CheckCircle2 size={22} />

            <div>
              <strong>No respiratory alerts</strong>

              <span>
                Persistent detector events will appear here.
              </span>
            </div>
          </div>
        ) : (
          <div className="doctor-dashboard-alert-list">
            {recentAlerts.map((alert) => (
              <button
                type="button"
                key={alert.id}
                className="doctor-dashboard-alert"
                onClick={() =>
                  navigate(
                    `/doctor/patient/${alert.patient_id}`
                  )
                }
              >
                <div
                  className={`doctor-alert-severity ${String(
                    alert.severity || ""
                  ).toLowerCase()}`}
                >
                  <BellRing size={18} />
                </div>

                <div className="doctor-dashboard-alert-content">
                  <div>
                    <strong>
                      {patientNameFromId(
                        alert.patient_id
                      )}
                    </strong>

                    <span>
                      {alert.severity || "ALERT"}
                    </span>
                  </div>

                  <p>{alert.message}</p>
                </div>

                <div className="doctor-dashboard-alert-time">
                  <Clock3 size={14} />
                  {timeAgo(alert.created_at)}
                </div>

                {!alert.acknowledged && (
                  <span className="doctor-unread-marker">
                    New
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}