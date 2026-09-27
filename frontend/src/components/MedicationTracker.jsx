import {
  AlarmClock,
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Pill,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Utensils,
  X,
  XCircle,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import api from "../services/api";


/* =========================================================
   TRACKER
========================================================= */

export default function MedicationTracker({
  patientId,
  patientName = "Patient",
  role = "PATIENT",
}) {
  const [todayData, setTodayData] =
    useState(null);

  const [tomorrowData, setTomorrowData] =
    useState(null);

  const [weekData, setWeekData] =
    useState(null);

  const [now, setNow] =
    useState(new Date());

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [modal, setModal] =
    useState(null);

  const [reason, setReason] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [saving, setSaving] =
    useState(false);


  const canRecord =
    role === "PATIENT" ||
    role === "FAMILY";


  /* =====================================================
     CLOCK
  ===================================================== */

  useEffect(() => {
    const timer = setInterval(
      () => {
        setNow(
          new Date()
        );
      },
      30000
    );

    return () =>
      clearInterval(timer);
  }, []);


  /* =====================================================
     DATES
  ===================================================== */

  const today =
    toLocalDateString(
      now
    );

  const tomorrow =
    toLocalDateString(
      addDays(
        now,
        1
      )
    );

  const weekStart =
    toLocalDateString(
      getMonday(
        now
      )
    );


  /* =====================================================
     LOAD
  ===================================================== */

  const loadTracker =
    useCallback(
      async (
        silent = false
      ) => {
        if (!patientId) {
          return;
        }

        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        try {
          const [
            todayResponse,
            tomorrowResponse,
            weekResponse,
          ] =
            await Promise.all([
              api.get(
                `/medications/patient/${patientId}/tracker`,
                {
                  params: {
                    date:
                      toLocalDateString(
                        new Date()
                      ),
                  },
                }
              ),

              api.get(
                `/medications/patient/${patientId}/tracker`,
                {
                  params: {
                    date:
                      toLocalDateString(
                        addDays(
                          new Date(),
                          1
                        )
                      ),
                  },
                }
              ),

              api.get(
                `/medications/patient/${patientId}/week`,
                {
                  params: {
                    start_date:
                      toLocalDateString(
                        getMonday(
                          new Date()
                        )
                      ),

                    today:
                      toLocalDateString(
                        new Date()
                      ),
                  },
                }
              ),
            ]);

          setTodayData(
            todayResponse.data
          );

          setTomorrowData(
            tomorrowResponse.data
          );

          setWeekData(
            weekResponse.data
          );

          setError("");
        } catch (err) {
          console.error(err);

          setError(
            err.response?.data?.detail ||
              "Unable to load medication schedule."
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [patientId]
    );


  useEffect(() => {
    loadTracker();

    const timer =
      setInterval(
        () =>
          loadTracker(
            true
          ),
        20000
      );

    return () =>
      clearInterval(timer);
  }, [loadTracker]);


  /* =====================================================
     TODAY SCHEDULE
  ===================================================== */

  const todaySchedule =
    useMemo(() => {
      const list =
        todayData?.schedule ||
        [];

      return list.map(
        (dose) => ({
          ...dose,

          effectiveStatus:
            getDoseStatus(
              dose,
              today,
              now
            ),
        })
      );
    }, [
      todayData,
      today,
      now,
    ]);


  /* =====================================================
     NEXT DOSE
  ===================================================== */

  const nextDose =
    useMemo(() => {
      const attention =
        todaySchedule.find(
          (dose) =>
            [
              "OVERDUE",
              "DUE",
              "DUE_SOON",
            ].includes(
              dose.effectiveStatus
            )
        );

      if (attention) {
        return {
          ...attention,
          scheduleDate:
            today,
        };
      }

      const upcoming =
        todaySchedule.find(
          (dose) =>
            dose.effectiveStatus
            === "UPCOMING"
        );

      if (upcoming) {
        return {
          ...upcoming,
          scheduleDate:
            today,
        };
      }

      const tomorrowDose =
        tomorrowData
          ?.schedule?.[0];

      if (tomorrowDose) {
        return {
          ...tomorrowDose,

          effectiveStatus:
            "UPCOMING",

          scheduleDate:
            tomorrow,
        };
      }

      return null;
    }, [
      todaySchedule,
      tomorrowData,
      today,
      tomorrow,
    ]);


  /* =====================================================
     TODAY SUMMARY
  ===================================================== */

  const summary =
    useMemo(() => {
      const result = {
        scheduled:
          todaySchedule.length,

        taken: 0,
        upcoming: 0,
        attention: 0,
        notTaken: 0,
      };

      todaySchedule.forEach(
        (dose) => {
          const status =
            dose.effectiveStatus;

          if (
            status === "TAKEN"
          ) {
            result.taken += 1;
          } else if (
            status ===
            "NOT_TAKEN"
          ) {
            result.notTaken += 1;
          } else if (
            [
              "DUE",
              "OVERDUE",
            ].includes(
              status
            )
          ) {
            result.attention +=
              1;
          } else {
            result.upcoming +=
              1;
          }
        }
      );

      return result;
    }, [todaySchedule]);


  const completion =
    summary.scheduled > 0
      ? Math.round(
          (
            summary.taken /
            summary.scheduled
          ) * 100
        )
      : 0;


  /* =====================================================
     RECORD
  ===================================================== */

  const openRecordModal = (
    dose,
    status
  ) => {
    setReason("");
    setNotes("");

    setModal({
      dose,
      status,
    });
  };


  const closeModal = () => {
    if (saving) {
      return;
    }

    setModal(null);
    setReason("");
    setNotes("");
  };


  const saveDose =
    async () => {
      if (!modal) {
        return;
      }

      try {
        setSaving(true);

        await api.post(
          "/medications/dose",
          {
            prescription_id:
              modal.dose
                .prescription_id,

            dose_number:
              modal.dose
                .dose_number,

            status:
              modal.status,

            dose_date:
              modal.dose
                .dose_date,

            reason:
              reason,

            notes:
              notes,
          }
        );

        closeModal();

        await loadTracker(
          true
        );
      } catch (err) {
        console.error(err);

        setError(
          err.response?.data?.detail ||
            "Unable to record dose."
        );
      } finally {
        setSaving(false);
      }
    };


  /* =====================================================
     LOADING
  ===================================================== */

  if (loading) {
    return (
      <div className="medtracker-loading">
        <RefreshCw
          size={24}
          className="medtracker-spin"
        />

        Loading medication
        schedule...
      </div>
    );
  }


  /* =====================================================
     PAGE
  ===================================================== */

  return (
    <>
      {/* ===============================================
          HEADER
      ================================================ */}

      <div className="medtracker-header">
        <div>
          <p className="page-eyebrow">
            MEDICATION CARE
          </p>

          <h1>
            Medication Schedule
          </h1>

          <p>
            {role === "PATIENT"
              ? "Track every scheduled dose separately throughout your day."
              : role === "FAMILY"
                ? `Follow ${patientName}'s medication schedule and record doses when helping with care.`
                : `Review ${patientName}'s medication schedule and adherence activity.`}
          </p>
        </div>

        <button
          type="button"
          className="medtracker-refresh"
          onClick={() =>
            loadTracker(
              true
            )
          }
          disabled={
            refreshing
          }
        >
          <RefreshCw
            size={16}
            className={
              refreshing
                ? "medtracker-spin"
                : ""
            }
          />

          Refresh
        </button>
      </div>


      {error && (
        <div className="medtracker-error">
          <AlertCircle
            size={18}
          />

          {error}
        </div>
      )}


      {/* ===============================================
          NEXT DOSE
      ================================================ */}

      <section className="medtracker-next-card">
        <div className="medtracker-next-label">
          <AlarmClock
            size={18}
          />

          NEXT DOSE
        </div>

        {nextDose ? (
          <div className="medtracker-next-layout">
            <div>
              <div className="medtracker-next-title">
                <h2>
                  {
                    nextDose.medicine_name
                  }
                </h2>

                <DoseStatus
                  status={
                    nextDose.effectiveStatus
                  }
                />
              </div>

              <p>
                {
                  nextDose.dosage
                }

                {nextDose.medicine_form
                  ? ` • ${nextDose.medicine_form}`
                  : ""}
              </p>

              <div className="medtracker-next-time">
                <Clock3
                  size={19}
                />

                <strong>
                  {formatClock(
                    nextDose.scheduled_time
                  )}
                </strong>

                <span>
                  {relativeDoseTime(
                    nextDose,
                    now
                  )}
                </span>
              </div>

              {nextDose.food_instruction && (
                <div className="medtracker-food">
                  <Utensils
                    size={15}
                  />

                  {
                    nextDose.food_instruction
                  }
                </div>
              )}
            </div>


            {canRecord &&
              ![
                "TAKEN",
                "NOT_TAKEN",
              ].includes(
                nextDose.effectiveStatus
              ) && (
                <div className="medtracker-next-actions">
                  <button
                    type="button"
                    className="medtracker-taken-button"
                    onClick={() =>
                      openRecordModal(
                        nextDose,
                        "TAKEN"
                      )
                    }
                  >
                    <Check
                      size={18}
                    />

                    Mark Taken
                  </button>

                  <button
                    type="button"
                    className="medtracker-skip-button"
                    onClick={() =>
                      openRecordModal(
                        nextDose,
                        "NOT_TAKEN"
                      )
                    }
                  >
                    Not Taken
                  </button>
                </div>
              )}
          </div>
        ) : (
          <div className="medtracker-all-done">
            <CheckCircle2
              size={31}
            />

            <div>
              <strong>
                No more scheduled
                doses
              </strong>

              <p>
                There are no upcoming
                medication doses in the
                current schedule.
              </p>
            </div>
          </div>
        )}
      </section>


      {/* ===============================================
          TODAY SUMMARY
      ================================================ */}

      <section className="medtracker-summary">
        <Summary
          label="Scheduled"
          value={
            summary.scheduled
          }
        />

        <Summary
          label="Taken"
          value={
            summary.taken
          }
        />

        <Summary
          label="Upcoming"
          value={
            summary.upcoming
          }
        />

        <Summary
          label="Needs attention"
          value={
            summary.attention +
            summary.notTaken
          }
        />
      </section>


      <section className="medtracker-progress-card">
        <div className="medtracker-progress-head">
          <div>
            <strong>
              Today's dose
              completion
            </strong>

            <span>
              {summary.taken} of{" "}
              {summary.scheduled}{" "}
              scheduled doses
              recorded as taken
            </span>
          </div>

          <b>
            {completion}%
          </b>
        </div>

        <div className="medtracker-progress-track">
          <div
            className="medtracker-progress-fill"
            style={{
              width:
                `${completion}%`,
            }}
          />
        </div>
      </section>


      {/* ===============================================
          TODAY TIMELINE
      ================================================ */}

      <section className="medtracker-section">
        <div className="medtracker-section-head">
          <div>
            <h2>
              Today's Schedule
            </h2>

            <p>
              Each scheduled dose is
              tracked independently.
            </p>
          </div>

          <CalendarDays
            size={20}
          />
        </div>


        {todaySchedule.length ===
        0 ? (
          <div className="medtracker-empty">
            <Pill size={30} />

            <h3>
              No doses scheduled
              today
            </h3>

            <p>
              Active prescriptions
              with scheduled times
              will appear here.
            </p>
          </div>
        ) : (
          <div className="medtracker-timeline">
            {todaySchedule.map(
              (dose) => (
                <DoseRow
                  key={
                    `${dose.prescription_id}-${dose.dose_number}`
                  }
                  dose={
                    dose
                  }
                  canRecord={
                    canRecord
                  }
                  onTaken={() =>
                    openRecordModal(
                      dose,
                      "TAKEN"
                    )
                  }
                  onNotTaken={() =>
                    openRecordModal(
                      dose,
                      "NOT_TAKEN"
                    )
                  }
                />
              )
            )}
          </div>
        )}
      </section>


      {/* ===============================================
          WEEK
      ================================================ */}

      <WeekTracker
        data={
          weekData
        }
      />


      {/* ===============================================
          ACTIVE PLANS
      ================================================ */}

      <section className="medtracker-section">
        <div className="medtracker-section-head">
          <div>
            <h2>
              Active Medication
              Plans
            </h2>

            <p>
              Current prescription
              schedules and
              instructions.
            </p>
          </div>

          <ShieldCheck
            size={20}
          />
        </div>

        <div className="medtracker-plan-grid">
          {(
            todayData
              ?.prescriptions ||
            []
          ).map(
            (plan) => (
              <article
                key={
                  plan.id
                }
                className="medtracker-plan"
              >
                <div className="medtracker-plan-icon">
                  <Pill
                    size={19}
                  />
                </div>

                <div>
                  <h3>
                    {
                      plan.medicine_name
                    }
                  </h3>

                  <strong>
                    {plan.dosage}

                    {plan.medicine_form
                      ? ` • ${plan.medicine_form}`
                      : ""}
                  </strong>

                  <p>
                    {
                      plan.dose_times
                        ?.map(
                          formatClock
                        )
                        .join(
                          " • "
                        )
                    }
                  </p>

                  {plan.food_instruction && (
                    <small>
                      {
                        plan.food_instruction
                      }
                    </small>
                  )}

                  {plan.instructions && (
                    <small>
                      {
                        plan.instructions
                      }
                    </small>
                  )}

                  <span className="medtracker-doctor">
                    Prescribed by{" "}
                    {
                      plan.doctor_name
                    }
                  </span>
                </div>
              </article>
            )
          )}
        </div>
      </section>


      {/* ===============================================
          RECORD MODAL
      ================================================ */}

      {modal && (
        <div className="medtracker-modal-backdrop">
          <div className="medtracker-modal">
            <button
              type="button"
              className="medtracker-modal-close"
              onClick={
                closeModal
              }
            >
              <X size={18} />
            </button>

            <div
              className={`medtracker-modal-icon ${
                modal.status ===
                "TAKEN"
                  ? "taken"
                  : "not-taken"
              }`}
            >
              {modal.status ===
              "TAKEN" ? (
                <CheckCircle2
                  size={24}
                />
              ) : (
                <XCircle
                  size={24}
                />
              )}
            </div>

            <h2>
              {modal.status ===
              "TAKEN"
                ? "Mark dose as taken?"
                : "Record dose as not taken?"}
            </h2>

            <div className="medtracker-modal-dose">
              <strong>
                {
                  modal.dose
                    .medicine_name
                }
              </strong>

              <span>
                {
                  modal.dose
                    .dosage
                }{" "}
                •{" "}
                {formatClock(
                  modal.dose
                    .scheduled_time
                )}
              </span>
            </div>


            {modal.status ===
              "NOT_TAKEN" && (
              <label className="medtracker-field">
                <span>
                  Reason
                </span>

                <select
                  value={
                    reason
                  }
                  onChange={(
                    event
                  ) =>
                    setReason(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    Select reason
                  </option>

                  <option value="Forgot">
                    Forgot
                  </option>

                  <option value="Medication unavailable">
                    Medication
                    unavailable
                  </option>

                  <option value="Patient chose not to take it">
                    Patient chose
                    not to take it
                  </option>

                  <option value="Other">
                    Other
                  </option>
                </select>
              </label>
            )}


            <label className="medtracker-field">
              <span>
                Optional note
              </span>

              <textarea
                rows="3"
                value={notes}
                placeholder="Add a note..."
                onChange={(
                  event
                ) =>
                  setNotes(
                    event.target
                      .value
                  )
                }
              />
            </label>


            <div className="medtracker-modal-actions">
              <button
                type="button"
                className="medtracker-secondary-button"
                onClick={
                  closeModal
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className={
                  modal.status ===
                  "TAKEN"
                    ? "medtracker-taken-button"
                    : "medtracker-confirm-not-taken"
                }
                disabled={
                  saving
                }
                onClick={
                  saveDose
                }
              >
                {saving
                  ? "Saving..."
                  : modal.status ===
                      "TAKEN"
                    ? "Confirm Taken"
                    : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


/* =========================================================
   DOSE ROW
========================================================= */

function DoseRow({
  dose,
  canRecord,
  onTaken,
  onNotTaken,
}) {
  const record =
    dose.record;

  return (
    <div
      className={`medtracker-dose-row status-${dose.effectiveStatus.toLowerCase()}`}
    >
      <div className="medtracker-dose-time">
        <strong>
          {formatClock(
            dose.scheduled_time
          )}
        </strong>

        <span>
          Dose{" "}
          {dose.dose_number}
        </span>
      </div>

      <div className="medtracker-dose-line">
        <span />
      </div>

      <div className="medtracker-dose-content">
        <div className="medtracker-dose-head">
          <div>
            <h3>
              {
                dose.medicine_name
              }
            </h3>

            <p>
              {dose.dosage}

              {dose.medicine_form
                ? ` • ${dose.medicine_form}`
                : ""}
            </p>
          </div>

          <DoseStatus
            status={
              dose.effectiveStatus
            }
          />
        </div>


        <div className="medtracker-dose-details">
          {dose.food_instruction && (
            <span>
              <Utensils
                size={14}
              />

              {
                dose.food_instruction
              }
            </span>
          )}

          {dose.instructions && (
            <span>
              {
                dose.instructions
              }
            </span>
          )}
        </div>


        {record && (
          <div className="medtracker-record">
            {record.status ===
              "TAKEN" && (
              <>
                Recorded as taken{" "}
                {record.timestamp
                  ? `at ${formatDateTime(
                      record.timestamp
                    )}`
                  : ""}
              </>
            )}

            {record.status ===
              "NOT_TAKEN" && (
              <>
                Not taken

                {record.reason
                  ? ` • ${record.reason}`
                  : ""}
              </>
            )}

            {record.marked_by && (
              <span>
                Recorded by{" "}
                {
                  record.marked_by
                }
              </span>
            )}
          </div>
        )}


        {canRecord &&
          ![
            "TAKEN",
            "NOT_TAKEN",
          ].includes(
            dose.effectiveStatus
          ) && (
            <div className="medtracker-dose-actions">
              <button
                type="button"
                onClick={
                  onTaken
                }
              >
                <Check
                  size={15}
                />

                Mark Taken
              </button>

              <button
                type="button"
                className="quiet"
                onClick={
                  onNotTaken
                }
              >
                Not Taken
              </button>
            </div>
          )}
      </div>
    </div>
  );
}


/* =========================================================
   WEEK
========================================================= */

function WeekTracker({
  data,
}) {
  if (!data) {
    return null;
  }

  const summary =
    data.summary || {};

  return (
    <section className="medtracker-section">
      <div className="medtracker-section-head">
        <div>
          <h2>
            7-Day Dose
            Completion
          </h2>

          <p>
            Dose-level adherence
            across this week.
          </p>
        </div>

        <strong className="medtracker-week-percent">
          {
            summary.completion_percent ??
            0
          }
          %
        </strong>
      </div>

      <div className="medtracker-week-grid">
        {(
          data.days || []
        ).map(
          (day) => (
            <div
              key={
                day.date
              }
              className="medtracker-week-day"
            >
              <span>
                {shortDay(
                  day.date
                )}
              </span>

              <strong>
                {day.taken}/
                {day.scheduled}
              </strong>

              <div
                className={
                  day.scheduled ===
                  0
                    ? "empty"
                    : day.taken ===
                        day.scheduled
                      ? "complete"
                      : "partial"
                }
              />
            </div>
          )
        )}
      </div>

      <div className="medtracker-week-stats">
        <span>
          <b>
            {summary.taken ||
              0}
          </b>
          Taken
        </span>

        <span>
          <b>
            {summary.not_taken ||
              0}
          </b>
          Not taken
        </span>

        <span>
          <b>
            {summary.missed ||
              0}
          </b>
          Missed
        </span>

        <span>
          <b>
            {summary.pending ||
              0}
          </b>
          Pending
        </span>
      </div>
    </section>
  );
}


/* =========================================================
   SUMMARY
========================================================= */

function Summary({
  label,
  value,
}) {
  return (
    <div className="medtracker-summary-card">
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
   STATUS
========================================================= */

function DoseStatus({
  status,
}) {
  return (
    <span
      className={`medtracker-status status-${String(
        status
      ).toLowerCase()}`}
    >
      {String(status)
        .replaceAll(
          "_",
          " "
        )}
    </span>
  );
}


/* =========================================================
   STATUS LOGIC
========================================================= */

function getDoseStatus(
  dose,
  scheduleDate,
  now
) {
  const recorded =
    String(
      dose.status ||
        "PENDING"
    ).toUpperCase();

  if (
    recorded === "TAKEN" ||
    recorded === "NOT_TAKEN"
  ) {
    return recorded;
  }

  const today =
    toLocalDateString(
      now
    );

  if (
    scheduleDate < today
  ) {
    return "MISSED";
  }

  if (
    scheduleDate > today
  ) {
    return "UPCOMING";
  }

  const scheduled =
    buildDoseDate(
      scheduleDate,
      dose.scheduled_time
    );

  if (!scheduled) {
    return "PENDING";
  }

  const differenceMinutes =
    (
      scheduled.getTime()
      - now.getTime()
    ) /
    60000;

  if (
    differenceMinutes >
    30
  ) {
    return "UPCOMING";
  }

  if (
    differenceMinutes >
    0
  ) {
    return "DUE_SOON";
  }

  if (
    differenceMinutes >=
    -60
  ) {
    return "DUE";
  }

  return "OVERDUE";
}


/* =========================================================
   TIME
========================================================= */

function relativeDoseTime(
  dose,
  now
) {
  const date =
    dose.scheduleDate ||
    dose.dose_date;

  const target =
    buildDoseDate(
      date,
      dose.scheduled_time
    );

  if (!target) {
    return "";
  }

  const diff =
    target.getTime()
    - now.getTime();

  const minutes =
    Math.round(
      Math.abs(diff) /
        60000
    );

  if (
    diff > 0
  ) {
    if (
      minutes < 60
    ) {
      return `Due in ${minutes} min`;
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    const remaining =
      minutes % 60;

    return `Due in ${hours}h ${remaining}m`;
  }

  if (
    minutes < 60
  ) {
    return `${minutes} min overdue`;
  }

  return `${
    Math.floor(
      minutes / 60
    )
  }h ${
    minutes % 60
  }m overdue`;
}


function buildDoseDate(
  dateString,
  timeString
) {
  if (
    !dateString ||
    !timeString
  ) {
    return null;
  }

  const date =
    new Date(
      `${dateString}T${timeString}:00`
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}


function formatClock(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      `2000-01-01T${value}:00`
    );

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}


function formatDateTime(
  value
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}


function toLocalDateString(
  input
) {
  const year =
    input.getFullYear();

  const month =
    String(
      input.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      input.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}


function addDays(
  input,
  amount
) {
  const date =
    new Date(input);

  date.setDate(
    date.getDate()
    + amount
  );

  return date;
}


function getMonday(
  input
) {
  const date =
    new Date(input);

  const day =
    date.getDay();

  const diff =
    day === 0
      ? -6
      : 1 - day;

  date.setDate(
    date.getDate()
    + diff
  );

  return date;
}


function shortDay(
  dateString
) {
  const date =
    new Date(
      `${dateString}T12:00:00`
    );

  return date.toLocaleDateString(
    [],
    {
      weekday: "short",
    }
  );
}