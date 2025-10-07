/*
 Fastest Finger First - Single File React + Firebase App
 ----------------------------------------------------------------------
 This file implements a real-time multi-user quiz platform with two roles:
  - Admin (identified by hard-coded ADMIN_UID)
  - Participant (default for newly registered users)

 Core Features:
  - Firebase Authentication (email + password)
  - Quiz creation (title + multiple questions, each with multiple options, multi/single correct answers)
  - Live Session control: Start Quiz, Next Question, End Quiz
  - Real-time question broadcasting via Firestore onSnapshot listeners
  - Participants answer once per question; response time captured using serverTimestamp + client delta
  - Leaderboard with score + total time (tie-break) + fastest finger per question
  - Responsive UI with Tailwind classes (assumes Tailwind is included externally if rendered directly)

 Usage Notes:
  1. Replace the placeholder Firebase config OR ensure window.__firebase_config is defined globally.
  2. Set the ADMIN_UID constant below to your admin user's Firebase Auth UID.
  3. Place this file in a React build environment (e.g., Vite, CRA) and import it into your root index.jsx, OR
     convert it into a standalone index.html by embedding this code inside a <script type="text/babel"> with CDN React + Babel.
  4. Firestore Schema (documents):
     - quizzes/{quizId} => { title, questions: [ { questionText, options, correctAnswers } ], createdAt, createdBy }
     - liveSession/{sessionId} => {
         quizId,
         status: 'waiting' | 'active' | 'finished',
         currentQuestionIndex: number (-1 lobby, 0..n),
         questionStartTimes: { [qIndex: string]: Timestamp },
         responses: { [qIndex: string]: { [userId: string]: { answer: string[], timestamp: Timestamp, correct: boolean, answerTimeMs: number } } },
         createdAt, createdBy
       }

 IMPORTANT SECURITY NOTE:
  - For production, restrict Firestore rules so only the admin UID can modify session control fields and quizzes.
  - Consider using subcollections for responses if expecting many participants (document size limits).

 Firestore Rules (Development Example Only - DO NOT use in production as-is):
 rules_version = '2';
 service cloud.firestore {
   match /databases/{database}/documents {
     match /quizzes/{quizId} {
       allow read: if true;
       allow write: if request.auth != null; // tighten for admin only in prod
     }
     match /liveSession/{sessionId} {
       allow read: if true;
       allow write: if request.auth != null; // tighten for admin + participant answer restrictions
     }
   }
 }

 ----------------------------------------------------------------------
*/

// Using global React & Firebase compat (provided by index.html CDN scripts)
const { useState, useEffect, useCallback, useMemo } = React;

// Provide modular-like helper wrappers so the original code structure can remain largely unchanged
// These wrap Firebase compat API calls.
let auth, db;
function ensureFirebase() {
  if (!window.__firebase_config) {
    // Build config from env fallback if present
    const env = window.__env || {};
    window.__firebase_config = {
      apiKey: env.FIREBASE_API_KEY || 'YOUR_API_KEY',
      authDomain: env.FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT.firebaseapp.com',
      projectId: env.FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
      storageBucket: env.FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT.appspot.com',
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || 'MSG_SENDER_ID',
      appId: env.FIREBASE_APP_ID || 'YOUR_APP_ID'
    };
  }
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(window.__firebase_config);
  }
  auth = firebase.auth();
  db = firebase.firestore();
}
ensureFirebase();

// Emulate modular helpers ---------------------------------------------------
function collection(_db, name) { return db.collection(name); }
function doc(_db, colName, id) { return db.collection(colName).doc(id); }
async function addDoc(colRef, data) { return colRef.add(data); }
async function updateDoc(ref, updates) { return ref.update(updates); }
function serverTimestamp() { return firebase.firestore.FieldValue.serverTimestamp(); }
function onSnapshot(refOrQuery, cb) { return refOrQuery.onSnapshot(cb); }
function orderBy(field, direction) { return { _orderBy: [field, direction] }; }
function query(colRef, orderObj) {
  if (orderObj && orderObj._orderBy) {
    const [f, dir] = orderObj._orderBy;
    return colRef.orderBy(f, dir);
  }
  return colRef;
}
async function getDoc(docRef) { return docRef.get(); }
async function getDocs(queryRef) { return queryRef.get(); }
function onAuthStateChangedCompat(authInst, handler) { return authInst.onAuthStateChanged(handler); }
async function createUserWithEmailAndPasswordCompat(authInst, email, password) { return authInst.createUserWithEmailAndPassword(email, password); }
async function signInWithEmailAndPasswordCompat(authInst, email, password) { return authInst.signInWithEmailAndPassword(email, password); }
async function updateProfileCompat(user, profile) { return user.updateProfile(profile); }
async function signOutCompat(authInst) { return authInst.signOut(); }

/***********************************
 * CONFIG + CONSTANTS
 ***********************************/
const ADMIN_UID = 'QaaAbC8pSAcM0xbPtMYWW96l61x1'; // <--- Change this to your admin UID

// Allow config injection via global (e.g., served by /env.js) or fallback placeholder.
const injected = typeof window !== 'undefined' ? (window.__firebase_config || {}) : {};
const firebaseConfig = window.__firebase_config || injected; // already initialized via ensureFirebase()

/***********************************
 * UTILS
 ***********************************/
const classNames = (...parts) => parts.filter(Boolean).join(' ');

const notify = (msg, type = 'info') => {
  if (typeof window === 'undefined') return;
  const el = document.createElement('div');
  el.className = `ff-toast ff-toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('ff-toast-hide');
    setTimeout(() => el.remove(), 300);
  }, 3000);
  if (type === 'error') console.error('[Toast]', msg); else console.log('[Toast]', msg);
};

/***********************************
 * AUTH COMPONENT
 ***********************************/
const AuthForm = ({ onDone }) => {
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleMode = () => setMode(m => (m === 'login' ? 'register' : 'login'));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
  await signInWithEmailAndPasswordCompat(auth, email, password);
        notify('Logged in', 'success');
      } else {
        const cred = await createUserWithEmailAndPasswordCompat(auth, email, password);
        if (displayName.trim() && cred.user.updateProfile) {
          await updateProfileCompat(cred.user, { displayName: displayName.trim() });
        }
        notify('Account created', 'success');
      }
  onDone && onDone();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-xl border border-slate-700 p-8">
        <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
        <p className="text-sm text-center mb-6 text-slate-400">Fastest Finger First Quiz</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-300">Email</label>
            <input type="email" required className="ff-input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">Display Name</label>
              <input type="text" required className="ff-input" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-300">Password</label>
            <input type="password" required className="ff-input" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button disabled={loading} type="submit" className="ff-btn-primary w-full flex items-center justify-center">
            {loading && <span className="ff-spinner mr-2" />} {mode === 'login' ? 'Sign In' : 'Register'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <button onClick={toggleMode} className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
};

/***********************************
 * QUIZ CREATION (Admin)
 ***********************************/
const QuizCreator = ({ onCreated }) => {
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([{
    questionText: '',
    options: ['', ''],
    correctAnswers: []
  }]);
  const [saving, setSaving] = useState(false);

  const updateQuestionField = (i, field, value) => {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  };

  const addQuestion = () => {
    setQuestions(qs => [...qs, { questionText: '', options: ['', ''], correctAnswers: [] }]);
  };

  const removeQuestion = (i) => {
    setQuestions(qs => qs.filter((_, idx) => idx !== i));
  };

  const addOption = (qi) => {
    setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, options: [...q.options, ''] } : q));
  };

  const updateOption = (qi, oi, val) => {
    setQuestions(qs => qs.map((q,i) => {
      if (i !== qi) return q;
      const newOptions = [...q.options];
      const prevVal = newOptions[oi];
      newOptions[oi] = val;
      // propagate change into correctAnswers if it existed
      const newCorrect = q.correctAnswers.map(ans => ans === prevVal ? val : ans);
      return { ...q, options: newOptions, correctAnswers: newCorrect };
    }));
  };

  const removeOption = (qi, oi) => {
    setQuestions(qs => qs.map((q,i) => {
      if (i !== qi) return q;
      const optVal = q.options[oi];
      const newOptions = q.options.filter((_, idx) => idx !== oi);
      const newCorrect = q.correctAnswers.filter(a => a !== optVal);
      return { ...q, options: newOptions, correctAnswers: newCorrect };
    }));
  };

  const toggleCorrect = (qi, option) => {
    setQuestions(qs => qs.map((q,i) => {
      if (i !== qi) return q;
      const exists = q.correctAnswers.includes(option);
      return { ...q, correctAnswers: exists ? q.correctAnswers.filter(a => a !== option) : [...q.correctAnswers, option] };
    }));
  };

  const validate = () => {
    if (!title.trim()) return 'Quiz title required';
    if (!questions.length) return 'At least one question required';
    for (const q of questions) {
      if (!q.questionText.trim()) return 'A question is missing text';
      const validOpts = q.options.filter(o => o.trim());
      if (validOpts.length < 2) return 'Each question needs at least two options';
      if (!q.correctAnswers.length) return 'Each question needs at least one correct answer';
    }
    return null;
  };

  const saveQuiz = async () => {
    const error = validate();
    if (error) { notify(error, 'error'); return; }
    setSaving(true);
    try {
  const quizDoc = await addDoc(collection(db, 'quizzes'), {
        title: title.trim(),
        questions: questions.map(q => ({
          questionText: q.questionText.trim(),
          options: q.options.map(o => o.trim()),
          correctAnswers: q.correctAnswers.map(c => c.trim())
        })),
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || null
      });
      notify('Quiz saved', 'success');
      setTitle('');
      setQuestions([{ questionText: '', options: ['', ''], correctAnswers: [] }]);
      onCreated && onCreated(quizDoc.id);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold">Create Quiz</h3>
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input className="ff-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Quiz title" />
      </div>
      {questions.map((q, qi) => (
        <div key={qi} className="border border-slate-600 rounded-lg p-4 space-y-4 bg-slate-700 shadow-sm">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-slate-100">Question {qi + 1}</h4>
            {questions.length > 1 && (
              <button onClick={() => removeQuestion(qi)} className="text-red-400 text-sm hover:text-red-300 hover:underline">Remove</button>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 uppercase tracking-wide">Question Text</label>
            <input className="ff-input" value={q.questionText} onChange={e => updateQuestionField(qi, 'questionText', e.target.value)} placeholder="Enter question" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide">Options</span>
              <button onClick={() => addOption(qi)} className="ff-btn-outline ff-btn-xs">Add Option</button>
            </div>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input className="ff-input flex-1" value={opt} onChange={e => updateOption(qi, oi, e.target.value)} placeholder={`Option ${oi + 1}`} />
                <label className="flex items-center text-xs gap-1 text-slate-300">
                  <input type="checkbox" checked={q.correctAnswers.includes(opt)} onChange={() => toggleCorrect(qi, opt)} />
                  Correct
                </label>
                {q.options.length > 2 && (
                  <button onClick={() => removeOption(qi, oi)} className="text-red-400 text-xs hover:text-red-300 hover:underline">X</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-3">
        <button onClick={addQuestion} className="ff-btn-secondary">Add Question</button>
        <button onClick={saveQuiz} disabled={saving} className="ff-btn-primary inline-flex items-center">{saving && <span className="ff-spinner mr-2" />}Save Quiz</button>
      </div>
    </div>
  );
};

/***********************************
 * QUIZ LIST & SESSION CREATION (Admin)
 ***********************************/
const QuizList = ({ onSelect }) => {
  const [quizzes, setQuizzes] = useState([]);
  useEffect(() => {
    const qRef = query(collection(db, 'quizzes'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qRef, snap => {
      setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);
  return (
    <div className="space-y-3">
      <h3 className="text-xl font-semibold">Existing Quizzes</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {quizzes.map(q => (
          <div key={q.id} className="border border-slate-600 rounded-lg p-4 bg-slate-700 shadow-sm flex flex-col">
            <h4 className="font-semibold mb-2 truncate text-slate-100" title={q.title}>{q.title}</h4>
            <p className="text-xs text-slate-400 mb-3">{q.questions?.length || 0} question(s)</p>
            <button onClick={() => onSelect(q)} className="ff-btn-outline mt-auto">Use This Quiz</button>
          </div>
        ))}
        {!quizzes.length && <p className="text-sm text-slate-400">No quizzes yet.</p>}
      </div>
    </div>
  );
};

/***********************************
 * HISTORICAL SESSIONS VIEWER (Admin)
 ***********************************/
const HistoricalSessions = ({ onViewSession }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const sessionsRef = collection(db, 'liveSession');
        const q = query(sessionsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const sessionsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setSessions(sessionsList);
      } catch (e) {
        notify('Error loading historical sessions: ' + e.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  if (loading) return <div className="text-center py-4"><div className="ff-spinner inline-block" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-slate-100">Historical Sessions</h3>
      {sessions.length === 0 && <p className="text-sm text-slate-400">No sessions found.</p>}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {sessions.map(session => {
          const createdDate = session.createdAt?.seconds 
            ? new Date(session.createdAt.seconds * 1000).toLocaleString()
            : 'Unknown date';
          const finishedDate = session.finishedAt?.seconds
            ? new Date(session.finishedAt.seconds * 1000).toLocaleString()
            : null;
          
          return (
            <div key={session.id} className="border border-slate-600 rounded-lg p-4 bg-slate-700 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded font-semibold ${
                  session.status === 'finished' ? 'bg-green-900/40 text-green-400' :
                  session.status === 'active' ? 'bg-blue-900/40 text-blue-400' :
                  'bg-slate-600 text-slate-300'
                }`}>
                  {session.status}
                </span>
                <span className="text-xs text-slate-400 font-mono">{session.id.slice(0, 8)}...</span>
              </div>
              
              <div className="text-xs text-slate-300 space-y-1">
                <p><span className="font-semibold">Created:</span> {createdDate}</p>
                {finishedDate && <p><span className="font-semibold">Finished:</span> {finishedDate}</p>}
                <p><span className="font-semibold">Quiz ID:</span> {session.quizId?.slice(0, 12)}...</p>
              </div>

              {session.winner && (
                <div className="border-t border-slate-600 pt-2 mt-2">
                  <p className="text-xs font-semibold text-amber-400">🏆 Winner</p>
                  <p className="text-xs text-slate-200">{session.winner.displayName}</p>
                  <p className="text-xs text-slate-400 font-mono">{session.winner.uid.slice(0, 12)}...</p>
                  <p className="text-xs text-slate-300">{session.winner.correctAnswers} correct • {session.winner.totalTimeMs}ms</p>
                </div>
              )}

              <button 
                onClick={() => onViewSession(session.id, session.quizId)} 
                className="ff-btn-outline ff-btn-xs w-full mt-2"
              >
                View Details
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/***********************************
 * ADMIN LIVE SESSION CONTROL
 ***********************************/
const AdminSessionPanel = ({ sessionId, quiz, onEnd }) => {
  const [session, setSession] = useState(null);
  const [responses, setResponses] = useState({});

  useEffect(() => {
    if (!sessionId) return;
    const ref = doc(db, 'liveSession', sessionId);
    const unsub = onSnapshot(ref, snap => {
      // In Firebase compat, check exists property (not method) for some cases
      if (snap && snap.exists) {
        const data = snap.data();
        setSession(data);
        setResponses(data.responses || {});
      }
    });
    return unsub;
  }, [sessionId]);

  const currentQIndex = session?.currentQuestionIndex ?? -1;
  const currentQuestion = currentQIndex >= 0 ? quiz?.questions?.[currentQIndex] : null;

  const startQuiz = async () => {
    if (!quiz) return;
  const ref = doc(db, 'liveSession', sessionId);
    await updateDoc(ref, {
      status: 'active',
      currentQuestionIndex: 0,
      [`questionStartTimes.0`]: serverTimestamp()
    });
    notify('Quiz started', 'success');
  };

  const nextQuestion = async () => {
    if (!quiz || currentQIndex < 0) return;
    if (currentQIndex >= quiz.questions.length - 1) return;
    const next = currentQIndex + 1;
  const ref = doc(db, 'liveSession', sessionId);
    await updateDoc(ref, {
      currentQuestionIndex: next,
      [`questionStartTimes.${next}`]: serverTimestamp()
    });
    notify('Moved to next question', 'success');
  };

  const endQuiz = async () => {
    const ref = doc(db, 'liveSession', sessionId);
    
    // Calculate winner before ending
    const stats = {};
    Object.entries(responses).forEach(([qIdx, rMap]) => {
      Object.entries(rMap || {}).forEach(([uid, r]) => {
        if (!stats[uid]) stats[uid] = { uid, correct: 0, totalTime: 0, displayName: r.displayName || 'Anonymous' };
        if (r.correct) {
          stats[uid].correct += 1;
          stats[uid].totalTime += (r.answerTimeMs || 0);
        }
      });
    });
    
    const arr = Object.values(stats);
    arr.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.totalTime - b.totalTime;
    });
    
    const winner = arr.length > 0 ? arr[0] : null;
    
    const updateData = {
      status: 'finished',
      finishedAt: serverTimestamp()
    };
    
    if (winner) {
      updateData.winner = {
        uid: winner.uid,
        displayName: winner.displayName,
        correctAnswers: winner.correct,
        totalTimeMs: winner.totalTime
      };
    }
    
    await updateDoc(ref, updateData);
    notify('Quiz ended', 'success');
    onEnd && onEnd();
  };

  // Build participants set
  const participantsSet = useMemo(() => {
    const set = new Set();
    Object.values(responses).forEach(qResp => {
      Object.keys(qResp || {}).forEach(uid => set.add(uid));
    });
    return Array.from(set);
  }, [responses]);

  const currentResponses = currentQIndex >= 0
    ? Object.entries((responses && responses[currentQIndex]) || {}).map(([uid, r]) => ({ uid, ...r }))
    : [];

  // Compute per-question fastest correct participant
  const fastestPerQuestion = useMemo(() => {
    const result = {};
    Object.entries(responses).forEach(([qIdx, rMap]) => {
      const correctOnes = Object.entries(rMap || {})
        .filter(([, v]) => v.correct)
        .map(([uid, v]) => ({ uid, ...v }));
      if (correctOnes.length) {
        correctOnes.sort((a, b) => (a.answerTimeMs ?? Infinity) - (b.answerTimeMs ?? Infinity));
        result[qIdx] = correctOnes[0];
      }
    });
    return result;
  }, [responses]);

  // Leaderboard calculation (on finish or live preview)
  const leaderboard = useMemo(() => {
    const stats = {};
    Object.entries(responses).forEach(([qIdx, rMap]) => {
      Object.entries(rMap || {}).forEach(([uid, r]) => {
        if (!stats[uid]) stats[uid] = { uid, correct: 0, totalTime: 0, answers: {} };
        stats[uid].answers[qIdx] = r;
        if (r.correct) {
          stats[uid].correct += 1;
          stats[uid].totalTime += (r.answerTimeMs || 0);
        }
      });
    });
    const arr = Object.values(stats);
    arr.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      return a.totalTime - b.totalTime; // lower time wins
    });
    return arr.map((s, i) => ({ rank: i + 1, ...s }));
  }, [responses]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3 items-center">
        <h3 className="text-xl font-semibold">Live Session Control</h3>
        {session?.status === 'waiting' && <button className="ff-btn-primary" onClick={startQuiz}>Start Quiz</button>}
        {session?.status === 'active' && currentQIndex >= 0 && currentQIndex < (quiz?.questions?.length || 0) - 1 && (
          <button className="ff-btn-secondary" onClick={nextQuestion}>Next Question</button>
        )}
        {session?.status === 'active' && <button className="ff-btn-danger" onClick={endQuiz}>End Quiz</button>}
        <span className="text-sm px-2 py-1 rounded bg-slate-700 text-slate-200 border border-slate-600">Status: {session?.status}</span>
        <span className="text-sm px-2 py-1 rounded bg-slate-700 text-slate-200 border border-slate-600">Current: {currentQIndex}</span>
      </div>

      {session?.status === 'active' && currentQuestion && (
        <div className="border border-slate-600 rounded-lg p-4 bg-slate-700 shadow-sm">
          <h4 className="font-semibold mb-2 text-slate-100">Current Question {currentQIndex + 1}</h4>
          <p className="mb-3 font-medium text-slate-200">{currentQuestion.questionText}</p>
          <ul className="list-disc ml-6 text-sm text-slate-300 space-y-1">
            {currentQuestion.options.map((o,i) => <li key={i}>{o}</li>)}
          </ul>
          <div className="mt-4">
            <h5 className="font-semibold mb-2 text-sm text-slate-100">Responses ({currentResponses.length})</h5>
            <div className="space-y-1 max-h-40 overflow-auto">
              {currentResponses.map(r => (
                <div key={r.uid} className="text-xs flex justify-between bg-slate-800 rounded px-2 py-1 border border-slate-600">
                  <span className="truncate mr-2 text-slate-300">{r.uid}</span>
                  <span className={classNames('font-medium', r.correct ? 'text-green-400' : 'text-red-400')}>
                    {r.correct ? 'Correct' : 'Wrong'} • {r.answerTimeMs ?? '?'}ms
                  </span>
                </div>
              ))}
              {!currentResponses.length && <p className="text-xs text-slate-400">No answers yet.</p>}
            </div>
          </div>
        </div>
      )}

      {session?.status === 'finished' && (
        <div className="space-y-6">
          <h4 className="text-xl font-semibold text-slate-100">Results</h4>
          
          {/* Winner Display */}
          {session.winner && (
            <div className="border border-amber-600 rounded-lg p-4 bg-amber-900/20">
              <h5 className="text-lg font-bold text-amber-400 mb-2">🏆 Winner</h5>
              <div className="space-y-1">
                <p className="text-slate-100"><span className="font-semibold">Name:</span> {session.winner.displayName}</p>
                <p className="text-slate-300 text-xs"><span className="font-semibold">UID:</span> {session.winner.uid}</p>
                <p className="text-slate-200"><span className="font-semibold">Score:</span> {session.winner.correctAnswers} correct • {session.winner.totalTimeMs}ms</p>
              </div>
            </div>
          )}
          
          <div className="overflow-auto border border-slate-600 rounded-lg bg-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-700 border-b border-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left text-slate-200">Rank</th>
                  <th className="px-3 py-2 text-left text-slate-200">Name</th>
                  <th className="px-3 py-2 text-left text-slate-200">UID</th>
                  <th className="px-3 py-2 text-left text-slate-200">Correct</th>
                  <th className="px-3 py-2 text-left text-slate-200">Total Time (ms)</th>
                  {quiz.questions.map((_, qi) => <th key={qi} className="px-3 py-2 text-left text-slate-200">Q{qi + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(row => {
                  const displayName = row.answers[0]?.displayName || row.answers[1]?.displayName || 
                                     Object.values(row.answers).find(a => a?.displayName)?.displayName || 'Anonymous';
                  return (
                    <tr key={row.uid} className="border-t border-slate-600">
                      <td className="px-3 py-2 font-semibold text-slate-200">{row.rank}</td>
                      <td className="px-3 py-2 text-slate-100 font-medium">{displayName}</td>
                      <td className="px-3 py-2"><span className="text-xs break-all text-slate-400 font-mono">{row.uid.slice(0, 8)}...</span></td>
                      <td className="px-3 py-2 text-slate-200">{row.correct}</td>
                      <td className="px-3 py-2 text-slate-200">{row.totalTime}</td>
                      {quiz.questions.map((q, qi) => {
                        const ans = row.answers[qi];
                        const fastest = fastestPerQuestion[qi];
                      const isFastest = fastest && fastest.uid === row.uid;
                      return (
                        <td key={qi} className={classNames('px-3 py-2 text-xs', isFastest && 'bg-amber-900/50 font-semibold')}>
                          {ans ? (
                            <div className="space-y-0.5">
                              <div className={ans.correct ? 'text-green-400' : 'text-red-400'}>{ans.correct ? '✓' : '✗'} {ans.answer.join(', ')}</div>
                              <div className="text-slate-400">{ans.answerTimeMs}ms</div>
                              {isFastest && <div className="text-amber-400 font-semibold">Fastest</div>}
                            </div>
                          ) : <span className="text-slate-500">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
                {!leaderboard.length && (
                  <tr><td colSpan={5 + quiz.questions.length} className="px-3 py-4 text-center text-slate-400">No answers recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/***********************************
 * PARTICIPANT VIEW
 ***********************************/
const ParticipantView = ({ session, quiz, user }) => {
  const currentQIndex = session?.currentQuestionIndex ?? -1;
  const currentQuestion = currentQIndex >= 0 ? quiz?.questions?.[currentQIndex] : null;
  const status = session?.status || 'waiting';
  const responses = session?.responses || {};
  const myResponse = currentQIndex >= 0 ? responses?.[currentQIndex]?.[user?.uid] : null;
  const multiSelect = currentQuestion && currentQuestion.correctAnswers.length > 1;
  const [pendingAnswers, setPendingAnswers] = useState([]);

  useEffect(() => {
    // Reset pending answers when question advances
    setPendingAnswers([]);
  }, [currentQIndex]);

  const togglePending = (opt) => {
    if (!multiSelect || myResponse) return;
    setPendingAnswers(list => list.includes(opt) ? list.filter(o => o !== opt) : [...list, opt]);
  };

  const submitAnswer = async (finalAnswers) => {
    if (!user || !quiz || !currentQuestion || myResponse) return;
    const sessionRef = doc(db, 'liveSession', session.id);
    const qIndexStr = String(currentQIndex);
    const startTs = session.questionStartTimes?.[qIndexStr];
    const answers = finalAnswers.length ? finalAnswers : [];
    if (!answers.length) { notify('Select at least one option', 'error'); return; }
    const normalized = answers.map(a => a.trim()).sort();
    const correct = normalized.join('|') === currentQuestion.correctAnswers.map(a => a.trim()).sort().join('|');
    let answerTimeMs = null;
    if (startTs?.seconds) {
      const startMs = startTs.seconds * 1000 + (startTs.nanoseconds || 0) / 1e6;
      answerTimeMs = Date.now() - startMs;
    }
    try {
      await updateDoc(sessionRef, {
        [`responses.${qIndexStr}.${user.uid}`]: {
          answer: answers,
          timestamp: serverTimestamp(),
          correct,
          answerTimeMs,
          displayName: user.displayName || user.email || 'Anonymous'
        }
      });
      notify('Answer submitted', 'success');
    } catch (e) {
      notify('Error submitting answer: ' + e.message, 'error');
    }
  };

  const singleClick = (opt) => {
    if (multiSelect) {
      togglePending(opt);
    } else {
      submitAnswer([opt]);
    }
  };

  if (status === 'waiting' || currentQIndex === -1) {
    return <div className="text-center py-16"><h3 className="text-xl font-semibold mb-2 text-slate-100">Waiting for the quiz to start…</h3><p className="text-slate-400">Stay ready!</p></div>;
  }
  if (status === 'finished') {
    // Summarize performance
    const allResponses = session.responses || {};
    let correctCount = 0, totalTime = 0;
    Object.values(allResponses).forEach(rMap => {
      const r = rMap[user.uid];
      if (r) { if (r.correct) { correctCount++; totalTime += (r.answerTimeMs || 0); } }
    });
    // Compute rank client-side (approx) by comparing with others
    const stats = {};
    Object.values(allResponses).forEach(rMap => {
      Object.entries(rMap || {}).forEach(([uid, r]) => {
        if (!stats[uid]) stats[uid] = { correct: 0, totalTime: 0 };
        if (r.correct) { stats[uid].correct++; stats[uid].totalTime += (r.answerTimeMs || 0); }
      });
    });
    const leaderboard = Object.entries(stats).map(([uid, s]) => ({ uid, ...s }))
      .sort((a, b) => b.correct - a.correct || a.totalTime - b.totalTime);
    const myRank = leaderboard.findIndex(r => r.uid === user.uid) + 1;
    return (
      <div className="text-center py-16 space-y-4">
        <h3 className="text-2xl font-semibold text-slate-100">Quiz Finished</h3>
        <p className="text-lg text-slate-200">You got <span className="font-bold text-green-400">{correctCount}</span> correct.</p>
        <p className="text-lg text-slate-200">Total Time: <span className="font-bold text-blue-400">{totalTime}ms</span></p>
        <p className="text-lg text-slate-200">Rank: <span className="font-bold text-amber-400">{myRank || '—'}</span></p>
      </div>
    );
  }
  // Active question view
  return (
    <div className="space-y-6">
      <div className="border border-slate-600 rounded-lg p-5 bg-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold mb-2 text-slate-100">Question {currentQIndex + 1}</h3>
        <p className="font-medium mb-4 text-slate-200">{currentQuestion.questionText}</p>
        <div className="grid gap-2">
          {currentQuestion.options.map((opt, i) => {
            const answered = !!myResponse;
            const correctReveal = answered && currentQuestion.correctAnswers.includes(opt);
            const pending = pendingAnswers.includes(opt);
            return (
              <button
                key={i}
                disabled={answered}
                onClick={() => singleClick(opt)}
                className={classNames(
                  'ff-option-btn',
                  pending && 'ff-option-pending',
                  answered && myResponse?.answer?.includes(opt) && 'ff-option-selected',
                  answered && correctReveal && 'ff-option-correct',
                  answered && !correctReveal && myResponse?.answer?.includes(opt) && 'ff-option-incorrect'
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {multiSelect && !myResponse && (
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => submitAnswer(pendingAnswers)} disabled={!pendingAnswers.length} className="ff-btn-primary ff-btn-sm">Submit</button>
            <span className="text-xs text-slate-400">Multi-select: choose all that apply then Submit</span>
          </div>
        )}
        {myResponse && (
          <div className="mt-4 text-sm text-slate-400">Answer locked. Waiting for next question…</div>
        )}
      </div>
    </div>
  );
};

/***********************************
 * ROOT APP
 ***********************************/
const FastestFingerApp = () => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [session, setSession] = useState(null); // live session doc data + id
  const [sessionId, setSessionId] = useState(null);
  const [autoSessionLookup, setAutoSessionLookup] = useState(true);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [quizForSession, setQuizForSession] = useState(null);

  useEffect(() => {
    return onAuthStateChangedCompat(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
  }, []);

  // If sessionId changes, subscribe to liveSession doc + matching quiz
  useEffect(() => {
    if (!sessionId) { setSession(null); setQuizForSession(null); return; }
    const ref = doc(db, 'liveSession', sessionId);
    const unsub = onSnapshot(ref, async (snap) => {
      // In Firebase compat, check exists property (not method)
      if (snap && snap.exists) {
        const data = { id: snap.id, ...snap.data() };
        setSession(data);
        // fetch quiz if missing or changed
        if (data.quizId && (!quizForSession || quizForSession.id !== data.quizId)) {
          const qSnap = await getDoc(doc(db, 'quizzes', data.quizId));
          if (qSnap && qSnap.exists) setQuizForSession({ id: qSnap.id, ...qSnap.data() });
        }
      }
    });
    return unsub;
  }, [sessionId]);

  const isAdmin = user && user.uid === ADMIN_UID;

  const createLiveSession = async () => {
    if (!selectedQuiz) { notify('Select a quiz first', 'error'); return; }
    
    console.log('🔥 Creating live session...', {
      selectedQuiz: selectedQuiz.id,
      user: user?.uid,
      isAdmin,
      dbInitialized: !!db
    });
    
    try {
      const sessionData = {
        quizId: selectedQuiz.id,
        status: 'waiting',
        currentQuestionIndex: -1,
        questionStartTimes: {},
        responses: {},
        createdAt: serverTimestamp(),
        createdBy: user.uid
      };
      
      console.log('📝 Session data to write:', sessionData);
      
      const newRef = await addDoc(collection(db, 'liveSession'), sessionData);
      
      console.log('✅ Session created successfully! ID:', newRef.id);
      setSessionId(newRef.id);
      notify('Live session created: ' + newRef.id, 'success');
    } catch (e) {
      console.error('❌ Error creating session:', {
        code: e.code,
        message: e.message,
        stack: e.stack
      });
      notify('Error creating session: ' + e.message, 'error');
      
      // Additional diagnostics
      if (e.code === 'permission-denied') {
        console.error('🚫 PERMISSION DENIED - Check Firestore rules!');
        console.log('Expected admin UID:', ADMIN_UID);
        console.log('Current user UID:', user?.uid);
      }
    }
  };

  // PARTICIPANT AUTO-DISCOVERY OF ACTIVE OR WAITING SESSION
  useEffect(() => {
    if (!user || user.uid === ADMIN_UID || !autoSessionLookup || sessionId) return;
    // Subscribe to most recent non-finished session
    const liveRef = collection(db, 'liveSession');
    const qRef = query(liveRef, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qRef, snap => {
      for (const d of snap.docs) {
        const data = d.data();
        if (data.status === 'waiting' || data.status === 'active') {
          setSessionId(d.id);
          break;
        }
      }
    });
    return unsub;
  }, [user, autoSessionLookup, sessionId]);

  const manualJoin = () => {
    if (!joinCodeInput.trim()) { notify('Enter a session ID', 'error'); return; }
    setSessionId(joinCodeInput.trim());
    setAutoSessionLookup(false);
  };

  // DIAGNOSTIC: Test Firestore connection
  const testFirestore = async () => {
    console.log('🧪 Testing Firestore connection...');
    
    try {
      // Test 1: Write
      console.log('Test 1: Attempting write to "test" collection...');
      const testRef = await addDoc(collection(db, 'test'), {
        timestamp: serverTimestamp(),
        message: 'Diagnostic test from FFF app',
        user: user?.uid || 'anonymous'
      });
      console.log('✅ WRITE succeeded! Doc ID:', testRef.id);
      notify('✅ Write test passed: ' + testRef.id, 'success');
      
      // Test 2: Read
      console.log('Test 2: Attempting read from "test" collection...');
      const snapshot = await getDocs(query(collection(db, 'test')));
      console.log('✅ READ succeeded! Found', snapshot.size, 'docs');
      notify(`✅ Read test passed: ${snapshot.size} docs found`, 'success');
      
      // Test 3: Check liveSession collection
      console.log('Test 3: Checking liveSession collection...');
      const liveSnapshot = await getDocs(collection(db, 'liveSession'));
      console.log('✅ liveSession collection accessible. Found', liveSnapshot.size, 'sessions');
      notify(`✅ Found ${liveSnapshot.size} live sessions`, 'success');
      
      console.log('🎉 ALL TESTS PASSED - Firestore is working!');
    } catch (e) {
      console.error('❌ Firestore test FAILED:', {
        code: e.code,
        message: e.message
      });
      
      if (e.code === 'permission-denied') {
        notify('❌ PERMISSION DENIED - Check Firestore rules!', 'error');
        console.error('🚫 Firestore rules are blocking access.');
        console.error('📋 See FIREBASE_SETUP.md for correct rules.');
      } else if (e.code === 'unavailable') {
        notify('❌ Firestore unavailable - Is it enabled?', 'error');
        console.error('🚫 Firestore may not be enabled in Firebase Console.');
      } else {
        notify('❌ Test failed: ' + e.message, 'error');
      }
    }
  };

  // Admin view layout
  const [adminTab, setAdminTab] = useState('current'); // 'current' or 'history'
  const [viewingHistoricalSession, setViewingHistoricalSession] = useState(null);
  const [viewingHistoricalQuiz, setViewingHistoricalQuiz] = useState(null);

  const handleViewHistoricalSession = async (sessionId, quizId) => {
    try {
      // Fetch session details
      const sessionDoc = await getDoc(doc(db, 'liveSession', sessionId));
      if (sessionDoc && sessionDoc.exists) {
        setViewingHistoricalSession({ id: sessionDoc.id, ...sessionDoc.data() });
      }
      
      // Fetch quiz details
      const quizDoc = await getDoc(doc(db, 'quizzes', quizId));
      if (quizDoc && quizDoc.exists) {
        setViewingHistoricalQuiz({ id: quizDoc.id, ...quizDoc.data() });
      }
      
      setAdminTab('current'); // Switch to current tab to show the session
    } catch (e) {
      notify('Error loading session: ' + e.message, 'error');
    }
  };

  const renderAdmin = () => (
    <div className="max-w-7xl mx-auto p-6 space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-100">Admin Dashboard</h2>
        <div className="flex items-center gap-3">
          <button onClick={testFirestore} className="ff-btn-outline text-xs">🧪 Test Firestore</button>
          <span className="text-xs bg-slate-700 text-slate-200 px-2 py-1 rounded font-mono">UID: {user.uid.slice(0, 8)}...</span>
          <button onClick={() => signOutCompat(auth)} className="ff-btn-outline">Sign Out</button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-600">
        <button
          onClick={() => { setAdminTab('current'); setViewingHistoricalSession(null); setViewingHistoricalQuiz(null); }}
          className={`px-4 py-2 font-medium transition-colors ${
            adminTab === 'current'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Current Session
        </button>
        <button
          onClick={() => setAdminTab('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            adminTab === 'history'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Historical Sessions
        </button>
      </div>

      {adminTab === 'current' && (
        <>
          {viewingHistoricalSession && viewingHistoricalQuiz ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <button onClick={() => { setViewingHistoricalSession(null); setViewingHistoricalQuiz(null); }} className="ff-btn-outline ff-btn-sm">← Back to Current</button>
                <span className="text-xs px-2 py-1 bg-slate-700 text-slate-200 border border-slate-600 rounded font-mono">Viewing: {viewingHistoricalSession.id.slice(0, 12)}...</span>
              </div>
              <AdminSessionPanel sessionId={viewingHistoricalSession.id} quiz={viewingHistoricalQuiz} onEnd={() => {}} />
            </div>
          ) : (
            <div className="grid gap-10 md:grid-cols-2">
              <QuizCreator onCreated={(id) => { /* optional post-create action */ }} />
        <div className="space-y-8">
          <QuizList onSelect={(q) => setSelectedQuiz(q)} />
          {selectedQuiz && !sessionId && (
            <div className="border border-slate-600 rounded-lg p-4 bg-slate-700 shadow-sm space-y-4">
              <h3 className="font-semibold text-slate-100">Selected Quiz</h3>
              <p className="text-sm text-slate-300">{selectedQuiz.title}</p>
              <button onClick={createLiveSession} className="ff-btn-primary">Create Live Session</button>
            </div>
          )}
          {sessionId && quizForSession && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-1 bg-slate-700 text-slate-200 border border-slate-600 rounded font-mono">Session ID: {sessionId}</span>
                <button onClick={() => { navigator.clipboard.writeText(sessionId); notify('Copied session ID','success'); }} className="ff-btn-outline ff-btn-xs">Copy</button>
              </div>
              <AdminSessionPanel sessionId={sessionId} quiz={quizForSession} onEnd={() => { /* keep session data */ }} />
            </div>
          )}
          {!sessionId && (
            <p className="text-sm text-slate-400">No active live session.</p>
          )}
        </div>
      </div>
          )}
        </>
      )}

      {adminTab === 'history' && (
        <HistoricalSessions onViewSession={handleViewHistoricalSession} />
      )}
    </div>
  );

  // Participant view layout
  const renderParticipant = () => (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Fastest Finger First</h2>
        <div className="flex gap-3 items-center">
          <span className="text-xs bg-slate-700 text-slate-200 px-2 py-1 rounded truncate max-w-[140px]" title={user.uid}>{user.displayName || user.email}</span>
          <button onClick={() => signOutCompat(auth)} className="ff-btn-outline ff-btn-xs">Sign Out</button>
        </div>
      </div>

      {!sessionId && (
        <div className="space-y-4 border border-slate-600 rounded-lg p-4 bg-slate-700 shadow-sm">
          <h3 className="font-medium text-slate-100">No Active Session Detected</h3>
          <p className="text-sm text-slate-400">Waiting for the admin to create or start a quiz. This page auto-joins the most recent live session.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input className="ff-input flex-1 min-w-[200px]" placeholder="Enter session ID" value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value)} />
            <button onClick={manualJoin} className="ff-btn-outline ff-btn-sm">Join</button>
            <button onClick={() => { setAutoSessionLookup(true); notify('Auto discovery enabled','info'); }} className="ff-btn-secondary ff-btn-sm">Auto Discover</button>
          </div>
          <p className="text-xs text-slate-500">(Provide participants this session ID: Admin sees it after creation.)</p>
        </div>
      )}
      {session && quizForSession && (
        <ParticipantView session={session} quiz={quizForSession} user={user} />
      )}
    </div>
  );

  if (loadingAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-900"><div className="ff-spinner" /></div>;
  if (!user) return <AuthForm onDone={() => { /* no-op */ }} />;

  return (
    <div className="min-h-screen bg-slate-900">
      {isAdmin ? renderAdmin() : renderParticipant()}
      {/* Debug panel (remove in production) */}
      <div className="fixed bottom-2 right-2 text-[10px] text-slate-400 bg-slate-800/80 backdrop-blur px-2 py-1 rounded shadow-sm border border-slate-700">
        {isAdmin ? 'Admin' : 'Participant'} • v1.0 • {firebaseConfig.projectId || (window.__env && window.__env.FIREBASE_PROJECT_ID) || 'N/A'}
      </div>
    </div>
  );
};

/***********************************
 * STYLES (minimal add-ons on top of Tailwind classes)
 ***********************************/
// If using a build step, you can move these into a CSS file. For pure single-file usage, this is fine.
const styleTagId = 'fff-single-styles';
if (typeof document !== 'undefined' && !document.getElementById(styleTagId)) {
  const style = document.createElement('style');
  style.id = styleTagId;
  style.textContent = `
  /* Global Dark Theme Overrides */
  :root { color-scheme: dark; }
  body, .min-h-screen { background:#0f172a !important; color:#f1f5f9; }
  .bg-white, .bg-gray-50, .bg-gray-100, .bg-gray-200, .bg-white\/80 { background:#1e293b !important; }
  .text-gray-500 { color:#64748b !important; }
  .text-gray-400 { color:#475569 !important; }
  .text-gray-600 { color:#94a3b8 !important; }
  .border, .border-gray-300, .border-gray-200 { border-color:#334155 !important; }
  .shadow-sm, .shadow, .shadow-lg { box-shadow:0 4px 12px rgba(0,0,0,0.4) !important; }

  /* Inputs */
  .ff-input { width:100%; background:#1e293b; color:#f1f5f9; border:1px solid #334155; border-radius:6px; padding:8px 12px; font-size:14px; line-height:1.25rem; }
  .ff-input::placeholder { color:#64748b; }
  .ff-input:focus { outline:2px solid rgba(96,165,250,0.45); border-color:#3b82f6; }

  /* Buttons */
  .ff-btn-primary { background:#2563eb; color:#f8fafc; padding:8px 16px; border-radius:6px; font-size:14px; font-weight:500; cursor:pointer; transition:background .15s; }
  .ff-btn-primary:hover:not(:disabled){ background:#1d4ed8; }
  .ff-btn-primary:disabled { opacity:.55; cursor:not-allowed; }
  .ff-btn-secondary { background:#4f46e5; color:#f8fafc; padding:8px 14px; border-radius:6px; font-size:14px; font-weight:500; cursor:pointer; transition:background .15s; }
  .ff-btn-secondary:hover{ background:#4338ca; }
  .ff-btn-outline { background:#1e293b; border:1px solid #334155; color:#e2e8f0; padding:8px 14px; border-radius:6px; font-size:14px; cursor:pointer; transition:background .15s, border-color .15s; }
  .ff-btn-outline:hover { background:#273548; border-color:#3e4c5c; }
  .ff-btn-danger { background:#dc2626; color:#f8fafc; padding:8px 14px; border-radius:6px; font-size:14px; cursor:pointer; }
  .ff-btn-danger:hover { background:#b91c1c; }
  .ff-btn-xs { padding:4px 8px; font-size:11px; }
  .ff-btn-sm { padding:6px 12px; font-size:12px; }

  /* Option Buttons */
  .ff-option-btn { text-align:left; border:1px solid #334155; border-radius:6px; background:#1e293b; padding:10px 14px; font-size:14px; line-height:1.2; cursor:pointer; transition:background .15s, border-color .15s, transform .15s; }
  .ff-option-btn:hover { background:#273548; }
  .ff-option-pending { border-color:#2563eb; background:#1e3a8a; }
  .ff-option-selected { box-shadow:0 0 0 2px #3b82f6 inset; }
  .ff-option-correct { border-color:#059669; color:#10b981; }
  .ff-option-incorrect { opacity:.65; }

  /* Spinner */
  .ff-spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,0.15); border-top-color:#3b82f6; border-radius:50%; animation:ff-spin .6s linear infinite; }
  @keyframes ff-spin { to { transform:rotate(360deg); } }

  /* Toasts */
  .ff-toast { position:fixed; top:1rem; right:1rem; background:#0f172a; border:1px solid #334155; color:#f1f5f9; padding:0.75rem 1rem; border-radius:10px; font-size:12px; box-shadow:0 6px 18px rgba(0,0,0,.55); opacity:1; transform:translateY(0); transition:all .3s; z-index:9999; backdrop-filter:blur(4px); }
  .ff-toast-success { background:#065f46; border-color:#0f766e; }
  .ff-toast-error { background:#7f1d1d; border-color:#b91c1c; }
  .ff-toast-hide { opacity:0; transform:translateY(-8px); }

  /* Cards / Panels */
  .shadow-sm, .shadow, .shadow-lg, .border.rounded-lg, .p-4, .p-5 { background:#1e293b; }
  .text-gray-700 { color:#cbd5e1 !important; }
  .text-gray-200 { color:#e2e8f0 !important; }
  .text-gray-100 { color:#f1f5f9 !important; }

  /* Debug badge */
  .fixed.bottom-2.right-2 { background:rgba(30,41,59,0.8) !important; color:#94a3b8 !important; }

  /* Table Styling */
  table { border-collapse:separate; border-spacing:0; }
  thead tr { background:#1e293b; }
  thead th { font-weight:600; color:#e2e8f0; border-bottom:1px solid #334155; }
  tbody tr { background:#1e293b; }
  tbody tr:nth-child(even) { background:#243043; }
  tbody td { border-bottom:1px solid #334155; }
  tbody tr:hover { background:#2a3a50; }

  /* Scrollbars (WebKit) */
  ::-webkit-scrollbar { width:10px; height:10px; }
  ::-webkit-scrollbar-track { background:#0f172a; }
  ::-webkit-scrollbar-thumb { background:#334155; border-radius:6px; }
  ::-webkit-scrollbar-thumb:hover { background:#3e4c5c; }
  `;
  document.head.appendChild(style);
}

// Mount automatically if root div exists
if (document.getElementById('root')) {
  const rootEl = document.getElementById('root');
  if (rootEl._reactRootContainer || rootEl.__root) {
    // Already mounted (hot reload). Could add logic if needed.
  } else if (ReactDOM && ReactDOM.createRoot) {
    ReactDOM.createRoot(rootEl).render(<FastestFingerApp />);
  } else if (ReactDOM && ReactDOM.render) {
    ReactDOM.render(<FastestFingerApp />, rootEl);
  }
}
