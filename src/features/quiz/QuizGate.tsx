import { useEffect, useMemo, useState } from "react";
import { useSchedule } from "../../state/schedule";

/**
 * Local-only quiz gate for MVP:
 * - Lets player pick Grade + Subject
 * - Generates 5 questions from a tiny bank
 * - Requires 5/5 correct to pass and unlock Build for the period
 * - Reports result via onClose({ passed, grade, subject, correctCount })
 */

type Subject =
  | "Math"
  | "Reading/Writing"
  | "Science"
  | "Social Studies"
  | "Languages"
  | "Test Prep";

type Grade =
  | "K"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12";

type Question = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  hint?: string;
};

export type QuizGateResult = {
  passed: boolean;
  grade: Grade;
  subject: Subject;
  correctCount: number;
};

export function QuizGate({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (result: QuizGateResult | null) => void;
}) {
  const [step, setStep] = useState<"pick" | "quiz" | "result">("pick");
  const [grade, setGrade] = useState<Grade>("5");
  const [subject, setSubject] = useState<Subject>("Math");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showHint, setShowHint] = useState(false);

  // NEW: schedule action
  const { markFivePassed } = useSchedule();

  // Reset when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep("pick");
      setIndex(0);
      setAnswers([]);
      setShowHint(false);
    }
  }, [open]);

  const correctCount = useMemo(() => {
    return answers.reduce((acc, a, i) => {
      const q = questions[i];
      return acc + (q && a === q.answerIndex ? 1 : 0);
    }, 0);
  }, [answers, questions]);

  function startQuiz() {
    const pool = getQuestionPool(subject, grade);
    const five = pickFive(pool);
    setQuestions(five);
    setIndex(0);
    setAnswers([]);
    setStep("quiz");
  }

  function answer(choiceIndex: number) {
    const next = [...answers];
    next[index] = choiceIndex;
    setAnswers(next);
    setShowHint(false);

    if (index < 4) {
      setIndex(index + 1);
    } else {
      setStep("result");
    }
  }

  function finish() {
    const passed = correctCount >= 5;
    if (passed) {
      // Unlock free build for the current period
      markFivePassed();
    }
    onClose({
      passed,
      grade,
      subject,
      correctCount,
    });
  }

  if (!open) return null;

  return (
    <div className="eva-modal">
      <div className="eva-sheet">
        {/* Header */}
        <div className="eva-head">
          <h3>5-Question Skill Check</h3>
          <button className="eva-x" onClick={() => onClose(null)} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Step: Pick */}
        {step === "pick" && (
          <div className="eva-body">
            <div className="grid2">
              <div>
                <label className="lbl">Grade</label>
                <select
                  className="inp"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value as Grade)}
                >
                  {["K","1","2","3","4","5","6","7","8","9","10","11","12"].map((g) => (
                    <option key={g} value={g}>
                      {g === "K" ? "Kindergarten" : `Grade ${g}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl">Subject</label>
                <select
                  className="inp"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value as Subject)}
                >
                  {[
                    "Math",
                    "Reading/Writing",
                    "Science",
                    "Social Studies",
                    "Languages",
                    "Test Prep",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="spacer" />
            <button className="primary w100" onClick={startQuiz}>
              Start 5-Q Warm-Up
            </button>

            <p className="muted small">
              Pass with <strong>5/5</strong> to unlock building this period. Hints give a nudge without full answers.
            </p>
          </div>
        )}

        {/* Step: Quiz */}
        {step === "quiz" && questions[index] && (
          <div className="eva-body">
            <div className="muted small">
              {subject} • {grade === "K" ? "K" : `G${grade}`} • Question {index + 1} / 5
            </div>
            <h4 className="q">{questions[index].prompt}</h4>

            <div className="choices">
              {questions[index].choices.map((c, i) => (
                <button key={i} className="choice" onClick={() => answer(i)}>
                  {String.fromCharCode(65 + i)}. {c}
                </button>
              ))}
            </div>

            <div className="row">
              <button className="ghost" onClick={() => setShowHint(!showHint)}>
                {showHint ? "Hide hint" : "I’m stuck (hint)"}
              </button>
              <div />
              <div className="muted small">
                Correct so far: <strong>{correctCount}</strong>
              </div>
            </div>

            {showHint && questions[index].hint && (
              <div className="hint">{questions[index].hint}</div>
            )}
          </div>
        )}

        {/* Step: Result */}
        {step === "result" && (
          <div className="eva-body">
            <h4 className="q">
              {correctCount >= 5 ? "Perfect! Free Build unlocked." : "Almost there—aim for 5/5."}
            </h4>
            <p className="muted">
              You got <strong>{correctCount}/5</strong> correct in {subject} •{" "}
              {grade === "K" ? "K" : `G${grade}`}.
            </p>

            <div className="grid2">
              <button className="ghost" onClick={startQuiz}>
                Try another set
              </button>
              <button className="primary" onClick={finish}>
                Continue
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inline styles for the modal so it works without extra CSS files */}
      <style>{`
        .eva-modal{
          position:fixed; inset:0; display:grid; place-items:center;
          background:rgba(2,6,23,.6); backdrop-filter: blur(6px); z-index:50;
          padding:16px;
        }
        .eva-sheet{
          width:100%; max-width:640px; background:#0f172a; color:#e6edf7;
          border:1px solid rgba(255,255,255,.08); border-radius:14px; overflow:hidden;
          box-shadow:0 20px 60px rgba(0,0,0,.5);
        }
        .eva-head{
          display:flex; align-items:center; justify-content:space-between;
          padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.06);
          background:linear-gradient(180deg, rgba(96,165,250,.08), transparent);
        }
        .eva-head h3{ margin:0; font-size:18px; }
        .eva-x{
          background:transparent; color:#9fb0c7; border:none; font-size:18px; cursor:pointer;
        }
        .eva-body{ padding:14px; }
        .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .lbl{ display:block; font-size:12px; color:#9fb0c7; margin-bottom:6px; }
        .inp{
          width:100%; background:#121a2c; color:#e6edf7; border-radius:10px;
          border:1px solid rgba(255,255,255,.08); padding:10px 12px;
        }
        .spacer{ height:8px; }
        .w100{ width:100%; }
        .muted{ color:#9fb0c7; }
        .small{ font-size:12px; }
        .q{ margin:8px 0 10px; }
        .choices{ display:grid; gap:8px; margin-bottom:8px; }
        .choice{
          text-align:left; background:#121a2c; border:1px solid rgba(255,255,255,.08);
          border-radius:10px; padding:10px 12px; cursor:pointer;
        }
        .choice:hover{ border-color:rgba(96,165,250,.35); }
        .row{ display:grid; grid-template-columns: auto 1fr auto; align-items:center; gap:10px; }
        .ghost{
          background:transparent; border:1px solid rgba(255,255,255,.12);
          color:#e6edf7; border-radius:10px; padding:8px 12px; cursor:pointer;
        }
        .hint{
          margin-top:10px; padding:10px 12px; background:rgba(34,211,238,.08);
          border:1px solid rgba(34,211,238,.25); border-radius:10px; color:#bdf8ff;
        }
      `}</style>
    </div>
  );
}

/* -------------------- Question Bank (tiny MVP) -------------------- */

function getQuestionPool(subject: Subject, grade: Grade): Question[] {
  // In a real build, fetch per-grade standards. For MVP we provide a small
  // set and vary wording slightly by grade.
  switch (subject) {
    case "Math":
      return mathBank(grade);
    case "Reading/Writing":
      return readingBank(grade);
    case "Science":
      return scienceBank(grade);
    case "Social Studies":
      return socialBank(grade);
    case "Languages":
      return languageBank(grade);
    case "Test Prep":
      return testPrepBank(grade);
  }
}

function pickFive(pool: Question[]): Question[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ---- Sample banks (keep tiny for MVP) ---- */
function mathBank(grade: Grade): Question[] {
  const easy = [
    {
      prompt: "What is 7 + 5?",
      choices: ["10", "11", "12", "13"],
      answerIndex: 2,
      hint: "Add 7 + 3 to reach 10, then add 2 more.",
    },
    {
      prompt: "Which fraction equals 1/2?",
      choices: ["2/6", "3/6", "4/6", "2/3"],
      answerIndex: 1,
      hint: "Half of 6 is 3.",
    },
    {
      prompt: "What is 9 × 3?",
      choices: ["18", "21", "24", "27"],
      answerIndex: 3,
      hint: "Think 9 + 9 + 9.",
    },
    {
      prompt: "Which is greater: 0.6 or 0.56?",
      choices: ["0.6", "0.56", "They are equal", "Cannot tell"],
      answerIndex: 0,
      hint: "Compare tenths first.",
    },
  ];

  const mid = [
    {
      prompt: "Solve for x: 2x + 6 = 18",
      choices: ["x = 5", "x = 6", "x = 7", "x = 9"],
      answerIndex: 0,
      hint: "Subtract 6 from both sides, then divide by 2.",
    },
    {
      prompt: "Area of a rectangle with width 4 and length 9?",
      choices: ["13", "18", "36", "40"],
      answerIndex: 2,
      hint: "Area = length × width.",
    },
    {
      prompt: "Which is equivalent to 45%?",
      choices: ["0.45", "4.5", "45/10", "1/45"],
      answerIndex: 0,
      hint: "Percent means per 100.",
    },
  ];

  const high = [
    {
      prompt: "Slope of the line through (2, 3) and (6, 11)?",
      choices: ["2", "1", "1/2", "3"],
      answerIndex: 2 === 2 ? 0 : 0, // keep simple; correct is 2
      hint: "m = (11−3)/(6−2).",
    },
    {
      prompt: "Factor: x² − 9",
      choices: ["(x−9)(x+1)", "(x−3)(x+3)", "(x−9)(x−1)", "(x+9)(x−1)"],
      answerIndex: 1,
      hint: "Difference of squares.",
    },
  ];

  const pool =
    grade === "K" || Number(grade) <= 4
      ? easy
      : Number(grade) <= 8
      ? easy.concat(mid)
      : easy.concat(mid, high);

  return pool.map((q) => ({ ...q, id: makeId("M") }));
}

function readingBank(grade: Grade): Question[] {
  const pool = [
    {
      prompt: "Which sentence is written correctly?",
      choices: ["me and sam runs fast.", "Sam and I run fast.", "Sam and me run fast.", "I and Sam runs fast."],
      answerIndex: 1,
      hint: "Subject-verb agreement and pronoun order.",
    },
    {
      prompt: "What is the main idea?",
      choices: [
        "A minor detail from the text.",
        "The central point the author makes.",
        "The author’s favorite sentence.",
        "The first sentence only.",
      ],
      answerIndex: 1,
      hint: "Think: biggest message.",
    },
    {
      prompt: "Choose the best transition to add a reason:",
      choices: ["However,", "For example,", "Because,", "First,"],
      answerIndex: 2,
      hint: "Signals cause.",
    },
  ];
  return pool.map((q) => ({ ...q, id: makeId("R") }));
}

function scienceBank(grade: Grade): Question[] {
  const pool = [
    {
      prompt: "Water changes from liquid to gas during:",
      choices: ["Freezing", "Evaporation", "Condensation", "Melting"],
      answerIndex: 1,
      hint: "Think: puddles disappearing in sun.",
    },
    {
      prompt: "Which is a renewable resource?",
      choices: ["Coal", "Oil", "Wind", "Natural gas"],
      answerIndex: 2,
      hint: "Can be replenished quickly.",
    },
    {
      prompt: "What force pulls objects toward Earth?",
      choices: ["Magnetism", "Friction", "Gravity", "Inertia"],
      answerIndex: 2,
      hint: "Keeps us on the ground.",
    },
  ];
  return pool.map((q) => ({ ...q, id: makeId("S") }));
}

function socialBank(grade: Grade): Question[] {
  const pool = [
    {
      prompt: "A democracy is a system where:",
      choices: ["One ruler holds all power.", "Citizens have a say in government.", "Military controls everything.", "Religious leaders govern."],
      answerIndex: 1,
      hint: "Think: voting.",
    },
    {
      prompt: "Which is a primary source?",
      choices: ["A modern textbook", "A movie based on history", "A diary from 1865", "A blog summary"],
      answerIndex: 2,
      hint: "Created during the time studied.",
    },
  ];
  return pool.map((q) => ({ ...q, id: makeId("SS") }));
}

function languageBank(grade: Grade): Question[] {
  const pool = [
    {
      prompt: "In Spanish, which means 'good morning'?",
      choices: ["Buenas noches", "Buenos días", "Buenas tardes", "Adiós"],
      answerIndex: 1,
      hint: "Dawn greeting.",
    },
    {
      prompt: "In French, 'merci' means:",
      choices: ["Please", "Thanks", "Hello", "Goodbye"],
      answerIndex: 1,
      hint: "Gratitude.",
    },
  ];
  return pool.map((q) => ({ ...q, id: makeId("L") }));
}

function testPrepBank(grade: Grade): Question[] {
  const pool = [
    {
      prompt: "Best strategy when stuck on a question?",
      choices: ["Spend all your time on it", "Guess immediately", "Eliminate wrong choices and move on", "Skip the whole section"],
      answerIndex: 2,
      hint: "Time management and POE.",
    },
    {
      prompt: "Before reading a passage, you should first:",
      choices: ["Skim the questions", "Read every word slowly", "Look up every unknown word", "Skip introductions"],
      answerIndex: 0,
      hint: "Preview guides attention.",
    },
  ];
  return pool.map((q) => ({ ...q, id: makeId("TP") }));
}
