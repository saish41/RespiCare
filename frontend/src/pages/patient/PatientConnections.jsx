import {
  Check,
  Copy,
  HeartHandshake,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import api from "../../services/api";


export default function PatientConnections() {
  const [connections, setConnections] =
    useState([]);

  const [pairingCode, setPairingCode] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [generating, setGenerating] =
    useState(false);

  const [copied, setCopied] =
    useState(false);

  const [error, setError] =
    useState("");


  const fetchConnections =
    useCallback(async () => {
      try {
        const response =
          await api.get(
            "/connections/my-connections"
          );

        setConnections(
          response.data || []
        );

        setError("");

      } catch (err) {
        console.error(err);

        setError(
          "Unable to load your care team."
        );
      } finally {
        setLoading(false);
      }
    }, []);


  useEffect(() => {
    fetchConnections();

    const interval =
      setInterval(
        fetchConnections,
        10000
      );

    return () =>
      clearInterval(interval);

  }, [fetchConnections]);


  const generateCode =
    async () => {
      try {
        setGenerating(true);
        setError("");
        setCopied(false);

        const response =
          await api.post(
            "/connections/generate-code"
          );

        setPairingCode(
          response.data.code
        );

      } catch (err) {
        console.error(err);

        setError(
          err.response?.data?.detail ||
          "Unable to generate pairing code."
        );
      } finally {
        setGenerating(false);
      }
    };


  const copyCode =
    async () => {
      if (!pairingCode) return;

      try {
        await navigator.clipboard.writeText(
          pairingCode
        );

        setCopied(true);

        setTimeout(
          () => setCopied(false),
          1800
        );

      } catch {
        setCopied(false);
      }
    };


  const removeConnection =
    async (connectionId) => {
      const confirmed =
        window.confirm(
          "Remove this person from your care team?"
        );

      if (!confirmed) return;

      try {
        await api.delete(
          `/connections/${connectionId}`
        );

        await fetchConnections();

      } catch (err) {
        console.error(err);

        setError(
          err.response?.data?.detail ||
          "Unable to remove connection."
        );
      }
    };


  const family =
    connections.filter(
      (item) =>
        item.role === "FAMILY"
    );


  const doctors =
    connections.filter(
      (item) =>
        item.role === "DOCTOR"
    );


  return (
    <div className="patient-connections-page">

      <header className="dashboard-header">

        <div>
          <p className="page-eyebrow">
            CONNECTED CARE
          </p>

          <h1>
            Your Care Team
          </h1>

          <p>
            Connect trusted family members
            and doctors to your RespiCare
            monitoring.
          </p>
        </div>


        <div className="connections-header-icon">
          <HeartHandshake size={25} />
        </div>

      </header>


      {error && (
        <div className="dashboard-error">
          {error}
        </div>
      )}


      <div className="patient-connection-grid">

        {/* PAIRING CODE */}

        <section className="patient-pairing-card">

          <div className="pairing-card-icon">
            <KeyRound size={25} />
          </div>


          <span className="section-kicker">
            ADD SOMEONE
          </span>

          <h2>
            Generate pairing code
          </h2>

          <p>
            Generate a temporary code and
            share it only with the family
            member or doctor you want to
            connect.
          </p>


          {!pairingCode ? (

            <button
              className="generate-pairing-button"
              onClick={generateCode}
              disabled={generating}
            >

              {generating ? (
                <>
                  <Loader2
                    size={17}
                    className="spin-icon"
                  />

                  Generating...
                </>
              ) : (
                <>
                  <KeyRound size={17} />

                  Generate Code
                </>
              )}

            </button>

          ) : (

            <div className="generated-code-area">

              <span>
                YOUR PAIRING CODE
              </span>


              <div className="generated-code">

                {pairingCode
                  .split("")
                  .map(
                    (character, index) => (

                      <strong key={index}>
                        {character}
                      </strong>

                    )
                  )}

              </div>


              <button
                className="copy-code-button"
                onClick={copyCode}
              >

                {copied ? (
                  <>
                    <Check size={15} />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={15} />
                    Copy Code
                  </>
                )}

              </button>


              <button
                className="generate-another-button"
                onClick={generateCode}
                disabled={generating}
              >

                <RefreshCw size={14} />

                Generate another code

              </button>

            </div>

          )}


          <div className="pairing-security-note">

            <ShieldCheck size={17} />

            <div>
              <strong>
                One-time access code
              </strong>

              <span>
                Generating a new code disables
                the previous unused code.
              </span>
            </div>

          </div>

        </section>


        {/* CARE TEAM */}

        <section className="patient-care-team-card">

          <div className="connected-card-header">

            <div>
              <span className="section-kicker">
                ACTIVE CONNECTIONS
              </span>

              <h2>
                Care Team
              </h2>
            </div>


            <div className="connected-count">
              {connections.length}
            </div>

          </div>


          {loading ? (

            <div className="connections-loading">

              <Loader2
                size={20}
                className="spin-icon"
              />

              Loading care team...

            </div>

          ) : connections.length === 0 ? (

            <div className="no-connected-patients">

              <div>
                <UsersRound size={27} />
              </div>

              <strong>
                Your care team is empty
              </strong>

              <span>
                Generate a code to securely
                connect family or a doctor.
              </span>

            </div>

          ) : (

            <div className="care-team-sections">

              {family.length > 0 && (
                <CareGroup
                  title="Family Guardians"
                  items={family}
                  type="family"
                  onRemove={
                    removeConnection
                  }
                />
              )}


              {doctors.length > 0 && (
                <CareGroup
                  title="Doctors"
                  items={doctors}
                  type="doctor"
                  onRemove={
                    removeConnection
                  }
                />
              )}

            </div>

          )}

        </section>

      </div>

    </div>
  );
}


function CareGroup({
  title,
  items,
  type,
  onRemove,
}) {
  return (
    <div className="care-group">

      <span className="care-group-title">
        {title}
      </span>


      {items.map((person) => (

        <div
          className="connected-care-person"
          key={person.connection_id}
        >

          <div
            className={
              `connected-care-avatar ${type}`
            }
          >

            {type === "doctor" ? (
              <Stethoscope size={18} />
            ) : (
              <UserRound size={18} />
            )}

          </div>


          <div className="connected-care-info">

            <strong>
              {type === "doctor" &&
              !person.name
                .toLowerCase()
                .startsWith("dr.")
                ? `Dr. ${person.name}`
                : person.name}
            </strong>

            <span>
              {type === "doctor"
                ? "Doctor"
                : "Family Guardian"}
            </span>

          </div>


          <div className="care-person-actions">

            <span className="connected-active-badge">
              <span />
              Active
            </span>


            <button
              onClick={() =>
                onRemove(
                  person.connection_id
                )
              }
            >
              Remove
            </button>

          </div>

        </div>

      ))}

    </div>
  );
}