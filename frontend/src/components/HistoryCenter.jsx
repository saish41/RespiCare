import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  Pill,
  Radio,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UserRound,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../context/AuthContext";
import api from "../services/api";


/* =========================================================
   CONSTANTS
========================================================= */

const PERIODS = [
  {
    value: 7,
    label: "7 Days",
  },
  {
    value: 30,
    label: "30 Days",
  },
  {
    value: 90,
    label: "90 Days",
  },
];


const STATE_RANK = {
  NORMAL: 0,
  WATCH: 1,
  WARNING: 2,
  DISTRESS: 3,
};


/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function HistoryCenter({
  role = "PATIENT",
}) {
  const { user } = useAuth();

  const [patients, setPatients] =
    useState([]);

  const [
    selectedPatientId,
    setSelectedPatientId,
  ] = useState(null);

  const [events, setEvents] =
    useState([]);

  const [
    medicationHistory,
    setMedicationHistory,
  ] = useState([]);

  const [
    prescriptions,
    setPrescriptions,
  ] = useState([]);

  const [activeTab, setActiveTab] =
    useState("RESPIRATORY");

  const [days, setDays] =
    useState(30);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [error, setError] =
    useState("");


  /* =====================================================
     PATIENT HELPERS
  ===================================================== */

  const getPatientId = (patient) => {
    return (
      patient?.patient_id ??
      patient?.patient?.id ??
      patient?.id ??
      null
    );
  };


  const getPatientName = (patient) => {
    return (
      patient?.patient_name ??
      patient?.patient?.name ??
      patient?.name ??
      "Patient"
    );
  };


  /* =====================================================
     PATIENT ACCOUNT
  ===================================================== */

  useEffect(() => {
    if (
      role === "PATIENT" &&
      user?.id
    ) {
      setSelectedPatientId(
        user.id
      );
    }
  }, [
    role,
    user?.id,
  ]);


  /* =====================================================
     FAMILY / DOCTOR CONNECTED PATIENTS
  ===================================================== */

  const loadConnectedPatients =
    useCallback(async () => {
      if (
        role === "PATIENT"
      ) {
        return;
      }

      try {
        setLoading(true);

        const response =
          await api.get(
            "/connections/my-patients"
          );

        const list =
          Array.isArray(
            response.data
          )
            ? response.data
            : [];

        setPatients(
          list
        );

        setSelectedPatientId(
          (current) => {
            if (
              current &&
              list.some(
                (patient) =>
                  Number(
                    getPatientId(
                      patient
                    )
                  ) ===
                  Number(current)
              )
            ) {
              return current;
            }

            if (
              list.length > 0
            ) {
              return getPatientId(
                list[0]
              );
            }

            return null;
          }
        );

        setError("");
      } catch (err) {
        console.error(err);

        setPatients([]);

        setError(
          err.response?.data?.detail ||
            "Unable to load connected patients."
        );
      } finally {
        setLoading(false);
      }
    }, [role]);


  useEffect(() => {
    loadConnectedPatients();
  }, [
    loadConnectedPatients,
  ]);


  /* =====================================================
     LOAD HISTORY
  ===================================================== */

  const loadHistory =
    useCallback(
      async (
        patientId,
        selectedDays,
        silent = false
      ) => {
        if (!patientId) {
          setEvents([]);
          setMedicationHistory([]);
          setPrescriptions([]);
          setLoading(false);
          return;
        }

        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const [
          eventResult,
          medicationResult,
          prescriptionResult,
        ] =
          await Promise.allSettled([
            api.get(
              `/respiratory-events/patient/${patientId}`
            ),

            api.get(
              `/medications/patient/${patientId}/history?days=${selectedDays}`
            ),

            api.get(
              `/medications/patient/${patientId}`
            ),
          ]);


        /* ===============================================
           RESPIRATORY EVENTS
        ================================================ */

        if (
          eventResult.status ===
          "fulfilled"
        ) {
          setEvents(
            extractArray(
              eventResult.value.data,
              [
                "events",
                "history",
                "items",
              ]
            )
          );
        } else {
          console.error(
            eventResult.reason
          );

          setEvents([]);
        }


        /* ===============================================
           MEDICATION HISTORY
        ================================================ */

        if (
          medicationResult.status ===
          "fulfilled"
        ) {
          setMedicationHistory(
            extractArray(
              medicationResult.value
                .data,
              [
                "history",
                "doses",
                "logs",
                "items",
              ]
            )
          );
        } else {
          console.error(
            medicationResult.reason
          );

          setMedicationHistory(
            []
          );
        }


        /* ===============================================
           PRESCRIPTIONS
        ================================================ */

        if (
          prescriptionResult.status ===
          "fulfilled"
        ) {
          setPrescriptions(
            extractArray(
              prescriptionResult.value
                .data,
              [
                "prescriptions",
                "items",
              ]
            )
          );
        } else {
          console.error(
            prescriptionResult.reason
          );

          setPrescriptions(
            []
          );
        }


        if (
          eventResult.status ===
            "rejected" &&
          medicationResult.status ===
            "rejected"
        ) {
          setError(
            "Unable to load history for this patient."
          );
        }

        setLoading(false);
        setRefreshing(false);
      },
      []
    );


  useEffect(() => {
    if (
      selectedPatientId
    ) {
      loadHistory(
        selectedPatientId,
        days
      );
    }
  }, [
    selectedPatientId,
    days,
    loadHistory,
  ]);


  /* =====================================================
     NORMALIZED RESPIRATORY EVENTS
  ===================================================== */

  const normalizedEvents =
    useMemo(() => {
      const cutoff =
        new Date();

      cutoff.setDate(
        cutoff.getDate() - days
      );

      return events
        .map(
          normalizeRespiratoryEvent
        )
        .filter((event) => {
          if (
            !event.startedAt
          ) {
            return true;
          }

          const date =
            new Date(
              event.startedAt
            );

          if (
            Number.isNaN(
              date.getTime()
            )
          ) {
            return true;
          }

          return date >= cutoff;
        })
        .sort(
          (a, b) =>
            getTimeValue(
              b.startedAt
            ) -
            getTimeValue(
              a.startedAt
            )
        );
    }, [
      events,
      days,
    ]);


  /* =====================================================
     PRESCRIPTION MAP
  ===================================================== */

  const prescriptionMap =
    useMemo(() => {
      const map =
        new Map();

      prescriptions.forEach(
        (prescription) => {
          map.set(
            Number(
              prescription.id
            ),
            prescription
          );
        }
      );

      return map;
    }, [prescriptions]);


  /* =====================================================
     NORMALIZED MEDICATION HISTORY
  ===================================================== */

  const normalizedMedication =
    useMemo(() => {
      return medicationHistory
        .map((item) =>
          normalizeMedicationItem(
            item,
            prescriptionMap
          )
        )
        .sort(
          (a, b) =>
            getTimeValue(
              b.timestamp
            ) -
            getTimeValue(
              a.timestamp
            )
        );
    }, [
      medicationHistory,
      prescriptionMap,
    ]);


  /* =====================================================
     CARE TIMELINE
  ===================================================== */

  const timeline =
    useMemo(() => {
      const respiratory =
        normalizedEvents.map(
          (event) => ({
            id:
              `resp-${event.id}`,

            kind:
              "RESPIRATORY",

            timestamp:
              event.startedAt,

            title:
              getEventTitle(
                event.eventType
              ),

            subtitle:
              `${formatState(
                event.highestState
              )} respiratory-pattern event`,

            source:
              event.source,

            state:
              event.highestState,
          })
        );


      const medication =
        normalizedMedication.map(
          (item) => ({
            id:
              `med-${item.id}`,

            kind:
              "MEDICATION",

            timestamp:
              item.timestamp,

            title:
              item.medicineName,

            subtitle:
              `${formatStatus(
                item.status
              )}${
                item.dosage
                  ? ` • ${item.dosage}`
                  : ""
              }`,

            source:
              null,

            state:
              item.status,
          })
        );


      return [
        ...respiratory,
        ...medication,
      ].sort(
        (a, b) =>
          getTimeValue(
            b.timestamp
          ) -
          getTimeValue(
            a.timestamp
          )
      );
    }, [
      normalizedEvents,
      normalizedMedication,
    ]);


  /* =====================================================
     SUMMARY
  ===================================================== */

  const highestState =
    useMemo(() => {
      if (
        normalizedEvents.length ===
        0
      ) {
        return "NONE";
      }

      return normalizedEvents.reduce(
        (highest, event) => {
          const currentRank =
            STATE_RANK[
              event.highestState
            ] ?? 0;

          const highestRank =
            STATE_RANK[
              highest
            ] ?? -1;

          return currentRank >
            highestRank
            ? event.highestState
            : highest;
        },
        "NORMAL"
      );
    }, [normalizedEvents]);


  const takenCount =
    normalizedMedication.filter(
      (item) =>
        item.status ===
        "TAKEN"
    ).length;


  const latestActivity =
    timeline.length > 0
      ? timeline[0]
          .timestamp
      : null;


  /* =====================================================
     SELECTED PATIENT
  ===================================================== */

  const selectedPatient =
    patients.find(
      (patient) =>
        Number(
          getPatientId(
            patient
          )
        ) ===
        Number(
          selectedPatientId
        )
    );


  const selectedPatientName =
    role === "PATIENT"
      ? user?.name ||
        "My History"
      : getPatientName(
          selectedPatient
        );


  /* =====================================================
     LOADING
  ===================================================== */

  if (
    role !== "PATIENT" &&
    loading &&
    patients.length === 0
  ) {
    return (
      <HistoryLoading />
    );
  }


  /* =====================================================
     NO CONNECTED PATIENT
  ===================================================== */

  if (
    role !== "PATIENT" &&
    !loading &&
    patients.length === 0
  ) {
    return (
      <>
        <HistoryHeader
          role={role}
        />

        <div className="history-empty-state">
          <UserRound
            size={32}
          />

          <h3>
            No connected patients
          </h3>

          <p>
            Connect to a patient
            before viewing their
            respiratory and medication
            history.
          </p>
        </div>
      </>
    );
  }


  /* =====================================================
     PAGE
  ===================================================== */

  return (
    <>
      <HistoryHeader
        role={role}
      />


      {/* ================================================
          PATIENT CONTROLS
      ================================================= */}

      <section className="history-control-card">
        {role !== "PATIENT" && (
          <div className="history-patient-control">
            <label>
              Patient
            </label>

            <select
              value={
                selectedPatientId ||
                ""
              }
              onChange={(event) =>
                setSelectedPatientId(
                  Number(
                    event.target
                      .value
                  )
                )
              }
            >
              {patients.map(
                (patient) => (
                  <option
                    key={
                      getPatientId(
                        patient
                      )
                    }
                    value={
                      getPatientId(
                        patient
                      )
                    }
                  >
                    {getPatientName(
                      patient
                    )}
                  </option>
                )
              )}
            </select>
          </div>
        )}


        <div className="history-period-control">
          <span>
            History range
          </span>

          <div className="history-period-buttons">
            {PERIODS.map(
              (period) => (
                <button
                  type="button"
                  key={
                    period.value
                  }
                  className={
                    days ===
                    period.value
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setDays(
                      period.value
                    )
                  }
                >
                  {period.label}
                </button>
              )
            )}
          </div>
        </div>


        <button
          type="button"
          className="history-refresh-button"
          disabled={
            refreshing ||
            !selectedPatientId
          }
          onClick={() =>
            loadHistory(
              selectedPatientId,
              days,
              true
            )
          }
        >
          <RefreshCw
            size={16}
            className={
              refreshing
                ? "history-spin"
                : ""
            }
          />

          {refreshing
            ? "Refreshing"
            : "Refresh"}
        </button>
      </section>


      {/* ================================================
          CONTEXT
      ================================================= */}

      <div className="history-context-row">
        <div>
          <span>
            Viewing history for
          </span>

          <strong>
            {selectedPatientName}
          </strong>
        </div>

        <div className="history-context-note">
          <CalendarDays
            size={16}
          />

          Past {days} days
        </div>
      </div>


      {error && (
        <div className="history-error">
          <AlertTriangle
            size={18}
          />

          {error}
        </div>
      )}


      {/* ================================================
          SUMMARY
      ================================================= */}

      <section className="history-summary-grid">
        <SummaryCard
          icon={
            <Activity
              size={20}
            />
          }
          label="Respiratory Events"
          value={
            normalizedEvents.length
          }
          hint={`Past ${days} days`}
        />

        <SummaryCard
          icon={
            <ShieldAlert
              size={20}
            />
          }
          label="Highest State"
          value={
            highestState ===
            "NONE"
              ? "No events"
              : formatState(
                  highestState
                )
          }
          hint="Highest recorded event state"
          state={
            highestState
          }
        />

        <SummaryCard
          icon={
            <Pill
              size={20}
            />
          }
          label="Dose Records"
          value={
            normalizedMedication.length
          }
          hint={`${takenCount} marked taken`}
        />

        <SummaryCard
          icon={
            <Clock3
              size={20}
            />
          }
          label="Latest Activity"
          value={
            latestActivity
              ? formatCompactDate(
                  latestActivity
                )
              : "No activity"
          }
          hint={
            latestActivity
              ? formatTime(
                  latestActivity
                )
              : "Nothing recorded yet"
          }
        />
      </section>


      {/* ================================================
          TABS
      ================================================= */}

      <section className="history-main-card">
        <div className="history-tabs">
          <button
            type="button"
            className={
              activeTab ===
              "RESPIRATORY"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveTab(
                "RESPIRATORY"
              )
            }
          >
            <Activity
              size={17}
            />

            Respiratory Events

            <span>
              {
                normalizedEvents.length
              }
            </span>
          </button>


          <button
            type="button"
            className={
              activeTab ===
              "MEDICATION"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveTab(
                "MEDICATION"
              )
            }
          >
            <Pill
              size={17}
            />

            Medication History

            <span>
              {
                normalizedMedication.length
              }
            </span>
          </button>


          <button
            type="button"
            className={
              activeTab ===
              "TIMELINE"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveTab(
                "TIMELINE"
              )
            }
          >
            <History
              size={17}
            />

            Care Timeline
          </button>
        </div>


        {loading ? (
          <HistoryLoading
            compact
          />
        ) : (
          <>
            {activeTab ===
              "RESPIRATORY" && (
              <RespiratoryHistory
                events={
                  normalizedEvents
                }
              />
            )}

            {activeTab ===
              "MEDICATION" && (
              <MedicationHistory
                items={
                  normalizedMedication
                }
              />
            )}

            {activeTab ===
              "TIMELINE" && (
              <CareTimeline
                items={
                  timeline
                }
              />
            )}
          </>
        )}
      </section>


      {/* ================================================
          INFORMATION NOTE
      ================================================= */}

      <div className="history-information-note">
        <ShieldAlert
          size={18}
        />

        <div>
          <strong>
            About this history
          </strong>

          <p>
            Respiratory entries represent
            persistent pattern changes
            detected by RespiCare. They are
            monitoring events, not medical
            diagnoses. Simulation-generated
            events are clearly identified.
          </p>
        </div>
      </div>
    </>
  );
}


/* =========================================================
   HEADER
========================================================= */

function HistoryHeader({
  role,
}) {
  const description =
    role === "PATIENT"
      ? "Review your respiratory-pattern events and medication activity."
      : role === "DOCTOR"
        ? "Review respiratory episodes and medication activity for connected patients."
        : "Review respiratory and medication activity for the people connected to you.";

  return (
    <header className="dashboard-header history-page-header">
      <div>
        <p className="page-eyebrow">
          CARE HISTORY
        </p>

        <h1>
          History
        </h1>

        <p>
          {description}
        </p>
      </div>

      <div className="history-header-icon">
        <History size={22} />
      </div>
    </header>
  );
}


/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({
  icon,
  label,
  value,
  hint,
  state,
}) {
  return (
    <article
      className={`history-summary-card ${
        state
          ? `state-${String(
              state
            ).toLowerCase()}`
          : ""
      }`}
    >
      <div className="history-summary-icon">
        {icon}
      </div>

      <div>
        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>

        <small>
          {hint}
        </small>
      </div>
    </article>
  );
}


/* =========================================================
   RESPIRATORY HISTORY
========================================================= */

function RespiratoryHistory({
  events,
}) {
  if (
    events.length === 0
  ) {
    return (
      <EmptyHistory
        icon={
          <Activity
            size={30}
          />
        }
        title="No respiratory-pattern events"
        text="No persistent respiratory-pattern events have been recorded for this period."
      />
    );
  }

  return (
    <div className="history-event-list">
      {events.map(
        (event) => (
          <RespiratoryEventCard
            key={event.id}
            event={event}
          />
        )
      )}
    </div>
  );
}


/* =========================================================
   RESPIRATORY EVENT CARD
========================================================= */

function RespiratoryEventCard({
  event,
}) {
  return (
    <article className="history-event-card">
      <div className="history-event-top">
        <div className="history-event-title">
          <div
            className={`history-event-status-icon state-${event.highestState.toLowerCase()}`}
          >
            <TrendingUp
              size={19}
            />
          </div>

          <div>
            <h3>
              {getEventTitle(
                event.eventType
              )}
            </h3>

            <div className="history-event-time">
              <Clock3
                size={14}
              />

              {formatDateTime(
                event.startedAt
              )}
            </div>
          </div>
        </div>


        <div className="history-event-badges">
          <span
            className={`history-state-badge state-${event.highestState.toLowerCase()}`}
          >
            {formatState(
              event.highestState
            )}
          </span>

          <span
            className={`history-source-badge ${
              event.source ===
              "SIMULATION"
                ? "simulation"
                : ""
            }`}
          >
            {event.source ===
              "SIMULATION" && (
              <Radio
                size={12}
              />
            )}

            {formatState(
              event.source
            )}
          </span>
        </div>
      </div>


      <div className="history-event-metrics">
        <EventMetric
          label="Baseline"
          value={
            formatBpm(
              event.baselineRate
            )
          }
        />

        <EventMetric
          label="Minimum"
          value={
            formatBpm(
              event.minimumRate
            )
          }
        />

        <EventMetric
          label="Maximum"
          value={
            formatBpm(
              event.maximumRate
            )
          }
        />

        <EventMetric
          label="Max deviation"
          value={
            formatPercent(
              event.maximumDeviation
            )
          }
        />
      </div>


      <div className="history-event-details">
        <div>
          <span>
            Duration
          </span>

          <strong>
            {formatDuration(
              event
            )}
          </strong>
        </div>

        <div>
          <span>
            Signal
          </span>

          <strong>
            {formatState(
              event.signalQuality
            )}
          </strong>
        </div>

        <div>
          <span>
            Event
          </span>

          <strong>
            {event.status ===
            "OPEN"
              ? "Ongoing"
              : "Completed"}
          </strong>
        </div>

        <div>
          <span>
            Alert
          </span>

          <strong>
            {event.alertGenerated
              ? "Generated"
              : "Not generated"}
          </strong>
        </div>
      </div>


      {event.progression.length >
        0 && (
        <div className="history-progression">
          <span>
            Detector progression
          </span>

          <div>
            {event.progression.map(
              (
                state,
                index
              ) => (
                <span
                  key={`${state}-${index}`}
                  className={`history-progression-state state-${state.toLowerCase()}`}
                >
                  {formatState(
                    state
                  )}

                  {index <
                    event
                      .progression
                      .length -
                      1 && (
                    <b>
                      →
                    </b>
                  )}
                </span>
              )
            )}
          </div>
        </div>
      )}


      {event.source ===
        "SIMULATION" && (
        <div className="history-simulation-note">
          This event was produced
          during controlled simulation
          testing.
        </div>
      )}
    </article>
  );
}


/* =========================================================
   EVENT METRIC
========================================================= */

function EventMetric({
  label,
  value,
}) {
  return (
    <div className="history-event-metric">
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}


/* =========================================================
   MEDICATION HISTORY
========================================================= */

function MedicationHistory({
  items,
}) {
  if (
    items.length === 0
  ) {
    return (
      <EmptyHistory
        icon={
          <Pill size={30} />
        }
        title="No medication history"
        text="No medication dose activity has been recorded for this period."
      />
    );
  }

  return (
    <div className="history-medication-list">
      {items.map(
        (item) => (
          <MedicationHistoryCard
            key={item.id}
            item={item}
          />
        )
      )}
    </div>
  );
}


/* =========================================================
   MEDICATION CARD
========================================================= */

function MedicationHistoryCard({
  item,
}) {
  return (
    <article className="history-medication-card">
      <div className="history-medication-main">
        <div
          className={`history-dose-icon status-${item.status.toLowerCase()}`}
        >
          {item.status ===
          "TAKEN" ? (
            <CheckCircle2
              size={19}
            />
          ) : (
            <Pill
              size={19}
            />
          )}
        </div>

        <div>
          <div className="history-medication-name">
            <h3>
              {item.medicineName}
            </h3>

            <span
              className={`history-dose-status status-${item.status.toLowerCase()}`}
            >
              {formatStatus(
                item.status
              )}
            </span>
          </div>

          <p>
            {item.dosage ||
              "Dose details unavailable"}

            {item.doseNumber
              ? ` • Dose ${item.doseNumber}`
              : ""}
          </p>
        </div>
      </div>


      <div className="history-medication-info">
        <div>
          <span>
            Scheduled
          </span>

          <strong>
            {item.scheduledTime ||
              "—"}
          </strong>
        </div>

        <div>
          <span>
            Date
          </span>

          <strong>
            {formatCompactDate(
              item.timestamp ||
                item.doseDate
            )}
          </strong>
        </div>

        <div>
          <span>
            Recorded by
          </span>

          <strong>
            {formatActor(
              item.markedBy
            )}
          </strong>
        </div>

        <div>
          <span>
            Recorded
          </span>

          <strong>
            {item.timestamp
              ? formatTime(
                  item.timestamp
                )
              : "—"}
          </strong>
        </div>
      </div>


      {(item.reason ||
        item.notes) && (
        <div className="history-medication-note">
          {item.reason && (
            <p>
              <strong>
                Reason:
              </strong>{" "}
              {item.reason}
            </p>
          )}

          {item.notes && (
            <p>
              <strong>
                Notes:
              </strong>{" "}
              {item.notes}
            </p>
          )}
        </div>
      )}
    </article>
  );
}


/* =========================================================
   CARE TIMELINE
========================================================= */

function CareTimeline({
  items,
}) {
  if (
    items.length === 0
  ) {
    return (
      <EmptyHistory
        icon={
          <History size={30} />
        }
        title="No care activity"
        text="Respiratory and medication activity will appear here in chronological order."
      />
    );
  }

  return (
    <div className="history-timeline">
      {items.map(
        (item) => (
          <div
            key={item.id}
            className="history-timeline-item"
          >
            <div
              className={`history-timeline-marker ${
                item.kind ===
                "RESPIRATORY"
                  ? "respiratory"
                  : "medication"
              }`}
            >
              {item.kind ===
              "RESPIRATORY" ? (
                <Activity
                  size={16}
                />
              ) : (
                <Pill
                  size={16}
                />
              )}
            </div>

            <div className="history-timeline-content">
              <div>
                <h3>
                  {item.title}
                </h3>

                <p>
                  {item.subtitle}
                </p>
              </div>

              <div className="history-timeline-meta">
                {item.source ===
                  "SIMULATION" && (
                  <span className="history-source-badge simulation">
                    SIMULATION
                  </span>
                )}

                <time>
                  {formatDateTime(
                    item.timestamp
                  )}
                </time>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}


/* =========================================================
   EMPTY STATE
========================================================= */

function EmptyHistory({
  icon,
  title,
  text,
}) {
  return (
    <div className="history-empty-state">
      {icon}

      <h3>
        {title}
      </h3>

      <p>
        {text}
      </p>
    </div>
  );
}


/* =========================================================
   LOADING
========================================================= */

function HistoryLoading({
  compact = false,
}) {
  return (
    <div
      className={`history-loading ${
        compact
          ? "compact"
          : ""
      }`}
    >
      <RefreshCw
        size={24}
        className="history-spin"
      />

      <span>
        Loading history...
      </span>
    </div>
  );
}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeRespiratoryEvent(
  event
) {
  const progression =
    normalizeProgression(
      event.progression
    );

  const highestState =
    String(
      event.highest_state ??
        event.highestState ??
        event.detector_state ??
        event.state ??
        "WATCH"
    ).toUpperCase();

  return {
    id:
      event.id ??
      `${event.patient_id}-${event.started_at}`,

    patientId:
      event.patient_id,

    eventType:
      event.event_type ??
      event.type ??
      "RESPIRATORY_PATTERN_CHANGE",

    highestState,

    source:
      String(
        event.source ??
          "LIVE"
      ).toUpperCase(),

    startedAt:
      event.started_at ??
      event.timestamp ??
      event.created_at ??
      null,

    endedAt:
      event.ended_at ??
      null,

    durationSeconds:
      event.duration_seconds ??
      null,

    baselineRate:
      numberOrNull(
        event.baseline_rate
      ),

    startingRate:
      numberOrNull(
        event.starting_rate
      ),

    minimumRate:
      numberOrNull(
        event.minimum_rate
      ),

    maximumRate:
      numberOrNull(
        event.maximum_rate
      ),

    maximumDeviation:
      numberOrNull(
        event.maximum_deviation_percent
      ),

    signalQuality:
      String(
        event.signal_quality ??
          "UNKNOWN"
      ).toUpperCase(),

    progression,

    alertGenerated:
      Boolean(
        event.alert_generated
      ),

    status:
      String(
        event.status ??
          (event.ended_at
            ? "CLOSED"
            : "OPEN")
      ).toUpperCase(),
  };
}


/* =========================================================
   MEDICATION NORMALIZATION
========================================================= */

function normalizeMedicationItem(
  item,
  prescriptionMap
) {
  const prescriptionId =
    Number(
      item.prescription_id ??
        item.prescription?.id ??
        0
    );

  const prescription =
    prescriptionMap.get(
      prescriptionId
    );


  const doseDate =
    item.dose_date ??
    item.date ??
    null;


  const scheduledTime =
    item.scheduled_time ??
    item.time ??
    null;


  const timestamp =
    item.timestamp ??
    item.marked_at ??
    item.taken_at ??
    buildDateTime(
      doseDate,
      scheduledTime
    );


  return {
    id:
      item.id ??
      `${prescriptionId}-${doseDate}-${item.dose_number}`,

    prescriptionId,

    medicineName:
      item.medicine_name ??
      item.medication_name ??
      item.medication?.name ??
      item.prescription
        ?.medicine_name ??
      prescription
        ?.medicine_name ??
      "Medication",

    dosage:
      item.dosage ??
      item.medication?.dosage ??
      item.prescription
        ?.dosage ??
      prescription?.dosage ??
      "",

    doseNumber:
      item.dose_number ??
      null,

    doseDate,

    scheduledTime,

    status:
      String(
        item.status ??
          "PENDING"
      ).toUpperCase(),

    markedBy:
      item.marked_by_name ??
      item.marked_by ??
      item.actor ??
      null,

    reason:
      item.reason ??
      "",

    notes:
      item.notes ??
      "",

    timestamp,
  };
}


/* =========================================================
   ARRAY EXTRACTION
========================================================= */

function extractArray(
  data,
  possibleKeys = []
) {
  if (
    Array.isArray(data)
  ) {
    return data;
  }

  for (
    const key of possibleKeys
  ) {
    if (
      Array.isArray(
        data?.[key]
      )
    ) {
      return data[key];
    }
  }

  return [];
}


/* =========================================================
   PROGRESSION
========================================================= */

function normalizeProgression(
  value
) {
  if (
    Array.isArray(value)
  ) {
    return value.map(
      (state) =>
        String(
          state
        ).toUpperCase()
    );
  }

  if (
    typeof value ===
      "string" &&
    value.trim()
  ) {
    return value
      .split(
        /→|,|>|\|/
      )
      .map(
        (state) =>
          state
            .trim()
            .toUpperCase()
      )
      .filter(Boolean);
  }

  return [];
}


/* =========================================================
   EVENT TITLES
========================================================= */

function getEventTitle(
  type
) {
  const value =
    String(
      type ||
        "RESPIRATORY_PATTERN_CHANGE"
    ).toUpperCase();

  if (
    value.includes("FAST")
  ) {
    return "Persistent Fast Breathing";
  }

  if (
    value.includes("SLOW")
  ) {
    return "Persistent Slow Breathing";
  }

  if (
    value.includes("SHALLOW")
  ) {
    return "Shallow Respiratory Pattern";
  }

  if (
    value.includes("PAUSE")
  ) {
    return "Respiratory Pause Pattern";
  }

  if (
    value.includes("DISTRESS")
  ) {
    return "Persistent Respiratory Disturbance";
  }

  return "Respiratory Pattern Change";
}


/* =========================================================
   FORMATTERS
========================================================= */

function formatState(
  value
) {
  if (!value) {
    return "Unknown";
  }

  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}


function formatStatus(
  status
) {
  const value =
    String(
      status ||
        "PENDING"
    ).toUpperCase();

  if (
    value === "NOT_TAKEN"
  ) {
    return "Not Taken";
  }

  return formatState(
    value
  );
}


function formatActor(
  value
) {
  if (!value) {
    return "Not recorded";
  }

  if (
    typeof value ===
    "object"
  ) {
    return (
      value.name ??
      value.email ??
      "Care team member"
    );
  }

  return formatState(
    value
  );
}


function formatBpm(
  value
) {
  const number =
    numberOrNull(
      value
    );

  if (
    number === null
  ) {
    return "—";
  }

  return `${number.toFixed(
    1
  )} BPM`;
}


function formatPercent(
  value
) {
  const number =
    numberOrNull(
      value
    );

  if (
    number === null
  ) {
    return "—";
  }

  const prefix =
    number > 0
      ? "+"
      : "";

  return `${prefix}${number.toFixed(
    1
  )}%`;
}


function formatDateTime(
  value
) {
  const date =
    parseDate(value);

  if (!date) {
    return "Time unavailable";
  }

  return date.toLocaleString(
    [],
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}


function formatCompactDate(
  value
) {
  const date =
    parseDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString(
    [],
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


function formatTime(
  value
) {
  const date =
    parseDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}


/* =========================================================
   DURATION
========================================================= */

function formatDuration(
  event
) {
  if (
    event.durationSeconds !=
    null
  ) {
    return humanDuration(
      event.durationSeconds
    );
  }

  if (
    event.startedAt &&
    event.endedAt
  ) {
    const start =
      getTimeValue(
        event.startedAt
      );

    const end =
      getTimeValue(
        event.endedAt
      );

    if (
      start &&
      end
    ) {
      return humanDuration(
        Math.max(
          0,
          (end - start) /
            1000
        )
      );
    }
  }

  if (
    event.status === "OPEN"
  ) {
    return "Ongoing";
  }

  return "—";
}


function humanDuration(
  seconds
) {
  const value =
    Math.round(
      Number(seconds)
    );

  if (
    !Number.isFinite(
      value
    )
  ) {
    return "—";
  }

  if (
    value < 60
  ) {
    return `${value} sec`;
  }

  const minutes =
    Math.floor(
      value / 60
    );

  const remaining =
    value % 60;

  if (
    minutes < 60
  ) {
    return `${minutes} min ${
      remaining
        ? `${remaining} sec`
        : ""
    }`.trim();
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  return `${hours} hr ${
    minutes % 60
  } min`;
}


/* =========================================================
   DATE HELPERS
========================================================= */

function parseDate(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}


function getTimeValue(
  value
) {
  const date =
    parseDate(value);

  return date
    ? date.getTime()
    : 0;
}


function buildDateTime(
  date,
  time
) {
  if (!date) {
    return null;
  }

  if (!time) {
    return date;
  }

  return `${date}T${time}`;
}


function numberOrNull(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}