import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  Search,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import api from "../../services/api";


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


function formatDate(value) {
  if (!value) return "Unknown time";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString();
}


export default function DoctorAlerts() {
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState([]);
  const [patients, setPatients] = useState([]);

  const [filter, setFilter] = useState("OPEN");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);


  const load = useCallback(async () => {
    try {
      const [
        alertsResponse,
        patientsResponse,
      ] = await Promise.all([
        api.get("/alerts/my-alerts"),
        api.get("/connections/my-patients"),
      ]);

      setAlerts(
        Array.isArray(alertsResponse.data)
          ? alertsResponse.data
          : []
      );

      setPatients(
        Array.isArray(patientsResponse.data)
          ? patientsResponse.data
          : []
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    load();

    const timer = setInterval(load, 5000);

    return () => clearInterval(timer);
  }, [load]);


  const patientName = (patientId) => {
    const patient = patients.find(
      (item) => getPatientId(item) === patientId
    );

    return patient
      ? getPatientName(patient)
      : `Patient #${patientId}`;
  };


  const acknowledge = async (alertId) => {
    try {
      setWorkingId(alertId);

      await api.post(
        `/alerts/${alertId}/acknowledge`
      );

      await load();
    } catch (error) {
      console.error(error);
    } finally {
      setWorkingId(null);
    }
  };


  const visibleAlerts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return alerts.filter((alert) => {
      const name = patientName(
        alert.patient_id
      ).toLowerCase();

      const message = String(
        alert.message || ""
      ).toLowerCase();


      const searchMatch =
        !query ||
        name.includes(query) ||
        message.includes(query);


      let filterMatch = true;

      if (filter === "OPEN") {
        filterMatch = !alert.acknowledged;
      }

      if (filter === "ACKNOWLEDGED") {
        filterMatch = alert.acknowledged;
      }

      if (filter === "CRITICAL") {
        filterMatch =
          String(alert.severity).toUpperCase() ===
          "CRITICAL";
      }


      return searchMatch && filterMatch;
    });
  }, [alerts, patients, filter, search]);


  const openCount = alerts.filter(
    (alert) => !alert.acknowledged
  ).length;


  return (
    <div className="doctor-dashboard">

      <header className="doctor-page-header">
        <div>
          <p className="doctor-eyebrow">
            RESPIRATORY EVENTS
          </p>

          <h1>Clinical Alerts</h1>

          <p>
            Review persistent respiratory-pattern events
            detected for your connected patients.
          </p>
        </div>

        <div className="doctor-header-count">
          <BellRing size={18} />

          <strong>{openCount}</strong>

          <span>Awaiting review</span>
        </div>
      </header>


      <div className="doctor-alert-disclaimer">
        <AlertTriangle size={19} />

        <p>
          Alerts indicate detected respiratory-pattern
          changes. Acknowledging an alert records that it
          has been reviewed; it does not indicate that the
          event has medically resolved.
        </p>
      </div>


      <div className="doctor-directory-toolbar">

        <div className="doctor-search-box">
          <Search size={18} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search alerts..."
          />
        </div>


        <div className="doctor-filter-tabs">
          {[
            ["OPEN", "Needs review"],
            ["ALL", "All"],
            ["CRITICAL", "Critical"],
            ["ACKNOWLEDGED", "Acknowledged"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={
                filter === value ? "active" : ""
              }
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

      </div>


      {loading ? (
        <div className="doctor-page-loading">
          <Activity className="doctor-spin" />
          Loading alerts...
        </div>
      ) : visibleAlerts.length === 0 ? (
        <div className="doctor-positive-empty large">
          <CheckCircle2 size={28} />

          <div>
            <strong>No alerts in this view</strong>

            <span>
              New persistent respiratory events will
              automatically appear here.
            </span>
          </div>
        </div>
      ) : (
        <div className="doctor-alert-list">

          {visibleAlerts.map((alert) => {
            const severity = String(
              alert.severity || "HIGH"
            ).toUpperCase();


            return (
              <article
                key={alert.id}
                className={`doctor-alert-card ${
                  alert.acknowledged
                    ? "acknowledged"
                    : ""
                }`}
              >

                <div
                  className={`doctor-alert-severity ${severity.toLowerCase()}`}
                >
                  <BellRing size={20} />
                </div>


                <div className="doctor-alert-main">

                  <div className="doctor-alert-heading">
                    <div>
                      <span
                        className={`doctor-severity-label ${severity.toLowerCase()}`}
                      >
                        {severity}
                      </span>

                      <h3>
                        {patientName(
                          alert.patient_id
                        )}
                      </h3>
                    </div>

                    <span className="doctor-alert-date">
                      <Clock3 size={14} />
                      {formatDate(alert.created_at)}
                    </span>
                  </div>


                  <p>{alert.message}</p>


                  <div className="doctor-alert-actions">

                    <button
                      type="button"
                      className="doctor-secondary-button"
                      onClick={() =>
                        navigate(
                          `/doctor/patient/${alert.patient_id}`
                        )
                      }
                    >
                      Open patient
                      <ArrowRight size={16} />
                    </button>


                    {!alert.acknowledged ? (
                      <button
                        type="button"
                        className="doctor-primary-button"
                        disabled={
                          workingId === alert.id
                        }
                        onClick={() =>
                          acknowledge(alert.id)
                        }
                      >
                        <Check size={16} />

                        {workingId === alert.id
                          ? "Saving..."
                          : "Acknowledge"}
                      </button>
                    ) : (
                      <span className="doctor-acknowledged-label">
                        <CheckCircle2 size={16} />
                        Acknowledged
                      </span>
                    )}

                  </div>

                </div>

              </article>
            );
          })}

        </div>
      )}

    </div>
  );
}