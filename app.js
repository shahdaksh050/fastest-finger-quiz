const { useState, useEffect, useRef } = React;

// Read runtime environment injected by /env.js
const ENV = window.__env || {};
window.__app_id = ENV.APP_ID || 'fastest-finger-quiz';

// Admin UID from env (keep default placeholder if not provided)
const ADMIN_UID = ENV.ADMIN_UID || 'REPLACE_WITH_YOUR_ADMIN_UID';

// Mock Firebase for demo purposes
const createMockFirebase = () => {
    let currentUser = null;
    let authListeners = [];
    let firestoreListeners = new Map();
    let mockData = {
        users: {},
        quizzes: {},
        liveSession: {}
    };

    const generateId = () => Math.random().toString(36).substr(2, 9);

    const mockAuth = {
        currentUser: null,
        onAuthStateChanged: (callback) => {
            authListeners.push(callback);
            callback(currentUser);
            return () => {
                authListeners = authListeners.filter(cb => cb !== callback);
            };
        },
        signInWithEmailAndPassword: async (email, password) => {
            const userId = email === 'admin@test.com' ? ADMIN_UID : generateId();
            currentUser = {
                uid: userId,
                email: email,
                displayName: email.split('@')[0]
            };
            authListeners.forEach(cb => cb(currentUser));
            return { user: currentUser };
        },
        createUserWithEmailAndPassword: async (email, password) => {
            const userId = generateId();
            currentUser = {
                uid: userId,
                email: email,
                displayName: '',
                updateProfile: async (profile) => {
                    currentUser.displayName = profile.displayName;
                }
            };
            authListeners.forEach(cb => cb(currentUser));
            return { user: currentUser };
        },
        signOut: async () => {
            currentUser = null;
            authListeners.forEach(cb => cb(null));
        }
    };

    const mockFirestore = {
        collection: (path) => ({
            doc: (docId) => ({
                set: async (data) => {
                    if (!mockData[path]) mockData[path] = {};
                    mockData[path][docId] = { ...data, id: docId };
                },
                get: async () => ({
                    exists: mockData[path] && mockData[path][docId],
                    data: () => mockData[path] && mockData[path][docId]
                }),
                update: async (updates) => {
                    if (!mockData[path]) mockData[path] = {};
                    if (!mockData[path][docId]) mockData[path][docId] = {};
                    
                    Object.keys(updates).forEach(key => {
                        if (key.includes('.')) {
                            const parts = key.split('.');
                            let current = mockData[path][docId];
                            for (let i = 0; i < parts.length - 1; i++) {
                                if (!current[parts[i]]) current[parts[i]] = {};
                                current = current[parts[i]];
                            }
                            current[parts[parts.length - 1]] = updates[key];
                        } else {
                            mockData[path][docId][key] = updates[key];
                        }
                    });
                    
                    // Notify listeners
                    const listenerId = `${path}/${docId}`;
                    if (firestoreListeners.has(listenerId)) {
                        firestoreListeners.get(listenerId).forEach(callback => {
                            callback({
                                exists: true,
                                data: () => mockData[path][docId]
                            });
                        });
                    }
                },
                onSnapshot: (callback) => {
                    const listenerId = `${path}/${docId}`;
                    if (!firestoreListeners.has(listenerId)) {
                        firestoreListeners.set(listenerId, []);
                    }
                    firestoreListeners.get(listenerId).push(callback);
                    
                    // Call immediately with current data
                    callback({
                        exists: mockData[path] && mockData[path][docId],
                        data: () => mockData[path] && mockData[path][docId] || {}
                    });
                    
                    return () => {
                        const listeners = firestoreListeners.get(listenerId);
                        if (listeners) {
                            const index = listeners.indexOf(callback);
                            if (index > -1) listeners.splice(index, 1);
                        }
                    };
                }
            }),
            add: async (data) => {
                const docId = generateId();
                if (!mockData[path]) mockData[path] = {};
                mockData[path][docId] = { ...data, id: docId };
                return { id: docId };
            },
            where: (field, operator, value) => ({
                orderBy: (orderField, direction) => ({
                    onSnapshot: (callback) => {
                        const docs = Object.values(mockData[path] || {})
                            .filter(doc => {
                                if (operator === '==') return doc[field] === value;
                                if (operator === 'in') return value.includes(doc[field]);
                                return true;
                            })
                            .map(doc => ({ id: doc.id, data: () => doc }));
                        
                        callback({ docs });
                        return () => {};
                    }
                }),
                onSnapshot: (callback) => {
                    const docs = Object.values(mockData[path] || {})
                        .filter(doc => {
                            if (operator === '==') return doc[field] === value;
                            if (operator === 'in') return value.includes(doc[field]);
                            return true;
                        })
                        .map(doc => ({ id: doc.id, data: () => doc }));
                    
                    callback({ docs });
                    return () => {};
                },
                limit: (num) => ({
                    onSnapshot: (callback) => {
                        const docs = Object.values(mockData[path] || {})
                            .filter(doc => {
                                if (operator === '==') return doc[field] === value;
                                if (operator === 'in') return value.includes(doc[field]);
                                return true;
                            })
                            .slice(0, num)
                            .map(doc => ({ id: doc.id, data: () => doc }));
                        
                        callback({ docs, empty: docs.length === 0 });
                        return () => {};
                    }
                })
            }),
            orderBy: (field, direction) => ({
                onSnapshot: (callback) => {
                    const docs = Object.values(mockData[path] || {})
                        .map(doc => ({ id: doc.id, data: () => doc }));
                    
                    callback({ docs });
                    return () => {};
                }
            })
        }),
        FieldValue: {
            serverTimestamp: () => ({ seconds: Date.now() / 1000 })
        }
    };

    return { auth: mockAuth, firestore: () => mockFirestore };
};

// Initialize Firebase (or mock)
// Build firebase config from injected env (if available)
window.__firebase_config = {
    apiKey: ENV.FIREBASE_API_KEY || 'demo-api-key',
    authDomain: ENV.FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
    projectId: ENV.FIREBASE_PROJECT_ID || 'demo-project',
    storageBucket: ENV.FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
    messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID || '123456789',
    appId: ENV.FIREBASE_APP_ID || '1:123456789:web:abcdef123456789'
};

let auth, db;
try {
    if (window.__firebase_config && window.__firebase_config.apiKey !== 'demo-api-key') {
        const app = firebase.initializeApp(window.__firebase_config);
        auth = firebase.auth();
        db = firebase.firestore();
    } else {
        const mockFirebase = createMockFirebase();
        auth = mockFirebase.auth;
        db = mockFirebase.firestore();
    }
} catch (error) {
    console.log("Using mock Firebase for demo", error);
    const mockFirebase = createMockFirebase();
    auth = mockFirebase.auth;
    db = mockFirebase.firestore();
}

// Utility function to show notifications
const showNotification = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    if (type === 'error') {
        console.error('Notification error:', message);
    } else {
        console.log('Notification:', type, message);
    }

    setTimeout(() => {
        if (document.body.contains(notification)) {
            document.body.removeChild(notification);
        }
    }, 3000);
};

// Authentication Component
const AuthComponent = ({ onAuthChange }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isLogin) {
                await auth.signInWithEmailAndPassword(email, password);
                showNotification('Login successful!', 'success');
            } else {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                if (userCredential.user.updateProfile) {
                    await userCredential.user.updateProfile({ displayName });
                }
                
                // Create user document
                await db.collection('users').doc(userCredential.user.uid).set({
                    email: email,
                    displayName: displayName,
                    role: 'participant',
                    createdAt: new Date()
                });
                
                showNotification('Registration successful!', 'success');
            }
        } catch (error) {
            showNotification(error.message, 'error');
        }
        
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--color-background)' }}>
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>
                        {isLogin ? 'Sign in to your account' : 'Create new account'}
                    </h2>
                    <p className="mt-2 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Fastest Finger First Quiz
                    </p>
                    <p className="mt-2 text-center text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        Demo: Use admin@test.com to login as admin
                    </p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input
                                type="email"
                                required
                                className="form-control rounded-t-md"
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        {!isLogin && (
                            <div>
                                <input
                                    type="text"
                                    required
                                    className="form-control"
                                    placeholder="Display name"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                />
                            </div>
                        )}
                        <div>
                            <input
                                type="password"
                                required
                                className="form-control rounded-b-md"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn--primary w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md"
                        >
                            {loading ? (
                                <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4"></div>
                            ) : (
                                isLogin ? 'Sign in' : 'Sign up'
                            )}
                        </button>
                    </div>

                    <div className="text-center">
                        <button
                            type="button"
                            className="text-blue-600 hover:text-blue-500"
                            onClick={() => setIsLogin(!isLogin)}
                        >
                            {isLogin ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Quiz Creator Component
const QuizCreator = ({ onQuizCreated }) => {
    const [title, setTitle] = useState('');
    const [questions, setQuestions] = useState([{
        questionText: '',
        options: ['', ''],
        correctAnswers: []
    }]);
    const [loading, setLoading] = useState(false);

    const addQuestion = () => {
        setQuestions([...questions, {
            questionText: '',
            options: ['', ''],
            correctAnswers: []
        }]);
    };

    const removeQuestion = (index) => {
        const newQuestions = questions.filter((_, i) => i !== index);
        setQuestions(newQuestions);
    };

    const updateQuestion = (questionIndex, field, value) => {
        const newQuestions = [...questions];
        newQuestions[questionIndex][field] = value;
        setQuestions(newQuestions);
    };

    const addOption = (questionIndex) => {
        const newQuestions = [...questions];
        newQuestions[questionIndex].options.push('');
        setQuestions(newQuestions);
    };

    const removeOption = (questionIndex, optionIndex) => {
        const newQuestions = [...questions];
        const removedOption = newQuestions[questionIndex].options[optionIndex];
        newQuestions[questionIndex].options.splice(optionIndex, 1);
        // Remove from correct answers if it was selected
        newQuestions[questionIndex].correctAnswers = newQuestions[questionIndex].correctAnswers.filter(
            answer => answer !== removedOption
        );
        setQuestions(newQuestions);
    };

    const updateOption = (questionIndex, optionIndex, value) => {
        const newQuestions = [...questions];
        const oldValue = newQuestions[questionIndex].options[optionIndex];
        newQuestions[questionIndex].options[optionIndex] = value;
        
        // Update correct answers if the option was previously correct
        const correctIndex = newQuestions[questionIndex].correctAnswers.indexOf(oldValue);
        if (correctIndex > -1) {
            newQuestions[questionIndex].correctAnswers[correctIndex] = value;
        }
        
        setQuestions(newQuestions);
    };

    const toggleCorrectAnswer = (questionIndex, option) => {
        const newQuestions = [...questions];
        const correctAnswers = newQuestions[questionIndex].correctAnswers;
        const index = correctAnswers.indexOf(option);
        
        if (index > -1) {
            correctAnswers.splice(index, 1);
        } else {
            correctAnswers.push(option);
        }
        
        setQuestions(newQuestions);
    };

    const saveQuiz = async () => {
        if (!title.trim()) {
            showNotification('Please enter a quiz title', 'error');
            return;
        }

        const validQuestions = questions.filter(q => 
            q.questionText.trim() && 
            q.options.filter(o => o.trim()).length >= 2 &&
            q.correctAnswers.length > 0
        );

        if (validQuestions.length === 0) {
            showNotification('Please add at least one valid question', 'error');
            return;
        }

        // Require authentication
        if (!auth || !auth.currentUser) {
            showNotification('You must be signed in to create a quiz', 'error');
            return;
        }

        setLoading(true);
        try {
            // Add a timeout to avoid hanging if Firestore/network is unreachable
            const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));
            const addPromise = db.collection('quizzes').add({
                title: title,
                questions: validQuestions,
                createdAt: new Date(),
                createdBy: auth.currentUser.uid
            });

            const quizRef = await Promise.race([addPromise, timeout(10000)]);
            
            showNotification('Quiz created successfully!', 'success');
            onQuizCreated(quizRef.id);
            
            // Reset form
            setTitle('');
            setQuestions([{
                questionText: '',
                options: ['', ''],
                correctAnswers: []
            }]);
        } catch (error) {
            showNotification('Error creating quiz: ' + error.message, 'error');
        }
        setLoading(false);
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="form-section">
                <h2 className="text-2xl font-bold mb-6">Create New Quiz</h2>
                
                <div className="mb-6">
                    <label className="form-label">Quiz Title</label>
                    <input
                        type="text"
                        className="form-control"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Enter quiz title"
                    />
                </div>

                {questions.map((question, questionIndex) => (
                    <div key={questionIndex} className="border rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">Question {questionIndex + 1}</h3>
                            {questions.length > 1 && (
                                <button
                                    onClick={() => removeQuestion(questionIndex)}
                                    className="text-red-600 hover:text-red-800"
                                >
                                    Remove Question
                                </button>
                            )}
                        </div>

                        <div className="mb-4">
                            <label className="form-label">Question Text</label>
                            <input
                                type="text"
                                className="form-control"
                                value={question.questionText}
                                onChange={(e) => updateQuestion(questionIndex, 'questionText', e.target.value)}
                                placeholder="Enter your question"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="form-label">Answer Options</label>
                            {question.options.map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-center mb-2">
                                    <input
                                        type="text"
                                        className="form-control mr-2"
                                        value={option}
                                        onChange={(e) => updateOption(questionIndex, optionIndex, e.target.value)}
                                        placeholder={`Option ${optionIndex + 1}`}
                                    />
                                    <label className="flex items-center mr-2">
                                        <input
                                            type="checkbox"
                                            checked={question.correctAnswers.includes(option)}
                                            onChange={() => toggleCorrectAnswer(questionIndex, option)}
                                            className="mr-1"
                                        />
                                        Correct
                                    </label>
                                    {question.options.length > 2 && (
                                        <button
                                            onClick={() => removeOption(questionIndex, optionIndex)}
                                            className="text-red-600 hover:text-red-800 ml-2"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                onClick={() => addOption(questionIndex)}
                                className="btn btn--outline btn--sm mt-2"
                            >
                                Add Option
                            </button>
                        </div>
                    </div>
                ))}

                <div className="flex gap-4 justify-center">
                    <button
                        onClick={addQuestion}
                        className="btn btn--secondary"
                    >
                        Add Question
                    </button>
                    <button
                        onClick={saveQuiz}
                        disabled={loading || !(auth && auth.currentUser)}
                        className="btn btn--primary"
                    >
                        {loading ? (
                            <div className="spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 mr-2"></div>
                        ) : null}
                        Save Quiz
                    </button>
                </div>
            </div>
        </div>
    );
};

// Quiz Control Panel
const QuizControlPanel = ({ quiz, sessionId, onEndQuiz }) => {
    const [session, setSession] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!sessionId) return;

        const unsubscribe = db.collection('liveSession').doc(sessionId).onSnapshot(doc => {
            if (doc.exists) {
                setSession(doc.data());
            }
        });

        return unsubscribe;
    }, [sessionId]);

    useEffect(() => {
        const unsubscribe = db.collection('users').where('role', '==', 'participant').onSnapshot(snapshot => {
            const participantData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setParticipants(participantData);
        });

        return unsubscribe;
    }, []);

    const startQuiz = async () => {
        setLoading(true);
        try {
            await db.collection('liveSession').doc(sessionId).update({
                status: 'active',
                currentQuestionIndex: 0
            });
            showNotification('Quiz started!', 'success');
        } catch (error) {
            showNotification('Error starting quiz: ' + error.message, 'error');
        }
        setLoading(false);
    };

    const nextQuestion = async () => {
        if (!session || session.currentQuestionIndex >= quiz.questions.length - 1) return;
        
        setLoading(true);
        try {
            await db.collection('liveSession').doc(sessionId).update({
                currentQuestionIndex: session.currentQuestionIndex + 1
            });
            showNotification('Next question displayed!', 'success');
        } catch (error) {
            showNotification('Error moving to next question: ' + error.message, 'error');
        }
        setLoading(false);
    };

    const endQuiz = async () => {
        setLoading(true);
        try {
            await db.collection('liveSession').doc(sessionId).update({
                status: 'finished'
            });
            showNotification('Quiz ended!', 'success');
            onEndQuiz();
        } catch (error) {
            showNotification('Error ending quiz: ' + error.message, 'error');
        }
        setLoading(false);
    };

    const getCurrentQuestionResponses = () => {
        if (!session || !session.responses || session.currentQuestionIndex < 0) return [];
        
        const currentResponses = session.responses[session.currentQuestionIndex.toString()] || {};
        return Object.entries(currentResponses).map(([userId, response]) => ({
            userId,
            ...response,
            participant: participants.find(p => p.id === userId)
        }));
    };

    const currentResponses = getCurrentQuestionResponses();

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="control-panel">
                <h2 className="text-2xl font-bold mb-6">Quiz Control Panel</h2>
                <h3 className="text-xl mb-4">{quiz.title}</h3>
                
                <div className="flex gap-4 mb-6 mobile-stack">
                    {(!session || session.status === 'waiting') && (
                        <button
                            onClick={startQuiz}
                            disabled={loading}
                            className="btn btn--primary mobile-full-width"
                        >
                            {loading ? 'Starting...' : 'Start Quiz'}
                        </button>
                    )}
                    
                    {session?.status === 'active' && session.currentQuestionIndex < quiz.questions.length - 1 && (
                        <button
                            onClick={nextQuestion}
                            disabled={loading}
                            className="btn btn--primary mobile-full-width"
                        >
                            {loading ? 'Loading...' : 'Next Question'}
                        </button>
                    )}
                    
                    {session?.status === 'active' && (
                        <button
                            onClick={endQuiz}
                            disabled={loading}
                            className="btn btn--secondary mobile-full-width"
                        >
                            {loading ? 'Ending...' : 'End Quiz'}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="card">
                        <div className="card__body">
                            <h4 className="text-lg font-semibold mb-4">Quiz Status</h4>
                            <div className="space-y-2">
                                <p><span className="font-medium">Status:</span> <span className="capitalize">{session?.status || 'waiting'}</span></p>
                                <p><span className="font-medium">Current Question:</span> {session?.currentQuestionIndex >= 0 ? session.currentQuestionIndex + 1 : 'Lobby'} / {quiz.questions.length}</p>
                                <p><span className="font-medium">Participants:</span> {participants.length}</p>
                            </div>
                            
                            {session?.currentQuestionIndex >= 0 && (
                                <div className="mt-4">
                                    <div className="progress-bar">
                                        <div 
                                            className="progress-fill" 
                                            style={{ width: `${((session.currentQuestionIndex + 1) / quiz.questions.length) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card__body">
                            <h4 className="text-lg font-semibold mb-4">Current Question Responses</h4>
                            {session?.currentQuestionIndex >= 0 ? (
                                <div className="participant-list">
                                    {currentResponses.length > 0 ? (
                                        currentResponses
                                            .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
                                            .map((response, index) => (
                                                <div key={response.userId} className="participant-item">
                                                    <div>
                                                        <span className="font-medium">
                                                            {response.participant?.displayName || 'Unknown User'}
                                                        </span>
                                                        <span className={`ml-2 text-sm ${response.correct ? 'text-green-600' : 'text-red-600'}`}>
                                                            {response.correct ? '✓' : '✗'}
                                                        </span>
                                                        {index === 0 && <span className="ml-2 text-yellow-600 font-bold">⚡ Fastest!</span>}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {response.answer.join(', ')}
                                                    </div>
                                                </div>
                                            ))
                                    ) : (
                                        <p className="text-gray-500">No responses yet</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-gray-500">Quiz not started</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Quiz Results Component
const QuizResults = ({ quiz, sessionId }) => {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const sessionDoc = await db.collection('liveSession').doc(sessionId).get();
                const sessionData = sessionDoc.data();
                
                if (!sessionData || !sessionData.responses) {
                    setLoading(false);
                    return;
                }

                const participantResults = {};
                
                // Initialize participant results
                Object.values(sessionData.responses).forEach(questionResponses => {
                    Object.keys(questionResponses).forEach(userId => {
                        if (!participantResults[userId]) {
                            participantResults[userId] = {
                                userId,
                                displayName: '',
                                totalScore: 0,
                                totalTime: 0,
                                responses: {}
                            };
                        }
                    });
                });

                // Get participant display names
                const userIds = Object.keys(participantResults);
                for (const uid of userIds) {
                    try {
                        const userDoc = await db.collection('users').doc(uid).get();
                        if (userDoc.exists) {
                            participantResults[uid].displayName = userDoc.data().displayName || 'Unknown User';
                        }
                    } catch (error) {
                        participantResults[uid].displayName = 'Unknown User';
                    }
                }

                // Calculate results for each question
                Object.entries(sessionData.responses).forEach(([questionIndex, responses]) => {
                    const questionNum = parseInt(questionIndex);
                    const question = quiz.questions[questionNum];
                    
                    // Find fastest response for this question
                    const sortedResponses = Object.entries(responses).sort(
                        ([, a], [, b]) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)
                    );
                    const fastestUserId = sortedResponses[0]?.[0];

                    Object.entries(responses).forEach(([userId, response]) => {
                        if (participantResults[userId]) {
                            participantResults[userId].responses[questionIndex] = {
                                ...response,
                                isFastest: userId === fastestUserId
                            };
                            
                            if (response.correct) {
                                participantResults[userId].totalScore++;
                            }
                            
                            // Add time penalty
                            participantResults[userId].totalTime += response.timestamp?.seconds || 0;
                        }
                    });
                });

                // Convert to array and sort by score (desc) then time (asc)
                const sortedResults = Object.values(participantResults).sort((a, b) => {
                    if (b.totalScore !== a.totalScore) {
                        return b.totalScore - a.totalScore;
                    }
                    return a.totalTime - b.totalTime;
                });

                setResults(sortedResults);
            } catch (error) {
                console.error('Error fetching results:', error);
                showNotification('Error loading results', 'error');
            }
            setLoading(false);
        };

        fetchResults();
    }, [quiz, sessionId]);

    if (loading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="spinner border-4 border-blue-600 border-t-transparent rounded-full w-8 h-8"></div>
                <span className="ml-3">Loading results...</span>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="card mb-8">
                <div className="card__body">
                    <h2 className="text-3xl font-bold mb-2">Quiz Results</h2>
                    <h3 className="text-xl mb-6" style={{ color: 'var(--color-text-secondary)' }}>{quiz.title}</h3>
                    
                    {/* Leaderboard */}
                    <div className="mb-8">
                        <h4 className="text-lg font-semibold mb-4">Final Leaderboard</h4>
                        <div className="space-y-2">
                            {results.map((participant, index) => (
                                <div 
                                    key={participant.userId} 
                                    className={`leaderboard-item p-4 rounded-lg flex justify-between items-center ${
                                        index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : ''
                                    }`}
                                >
                                    <div className="flex items-center">
                                        <span className="text-2xl font-bold mr-4">#{index + 1}</span>
                                        <div>
                                            <div className="font-semibold">{participant.displayName}</div>
                                            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                                {participant.totalScore} / {quiz.questions.length} correct
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="score-display">{participant.totalScore}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Detailed Results Table */}
                    <div className="results-table">
                        <h4 className="text-lg font-semibold mb-4">Detailed Results</h4>
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse border" style={{ borderColor: 'var(--color-border)' }}>
                                <thead>
                                    <tr style={{ backgroundColor: 'var(--color-bg-1)' }}>
                                        <th className="border px-4 py-2 text-left" style={{ borderColor: 'var(--color-border)' }}>Participant</th>
                                        {quiz.questions.map((_, index) => (
                                            <th key={index} className="border px-4 py-2 text-center" style={{ borderColor: 'var(--color-border)' }}>
                                                Q{index + 1}
                                            </th>
                                        ))}
                                        <th className="border px-4 py-2 text-center" style={{ borderColor: 'var(--color-border)' }}>Total Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map(participant => (
                                        <tr key={participant.userId}>
                                            <td className="border px-4 py-2 font-medium" style={{ borderColor: 'var(--color-border)' }}>
                                                {participant.displayName}
                                            </td>
                                            {quiz.questions.map((question, qIndex) => {
                                                const response = participant.responses[qIndex.toString()];
                                                return (
                                                    <td key={qIndex} className={`border px-4 py-2 text-center ${
                                                        response?.isFastest ? 'fastest-finger' : ''
                                                    }`} style={{ borderColor: 'var(--color-border)' }}>
                                                        {response ? (
                                                            <div>
                                                                <div className={`${response.correct ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {response.correct ? '✓' : '✗'}
                                                                </div>
                                                                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                                                    {response.answer.join(', ')}
                                                                </div>
                                                                {response.isFastest && (
                                                                    <div className="text-yellow-600 text-xs font-bold">⚡ Fastest</div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: 'var(--color-text-secondary)' }}>-</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="border px-4 py-2 text-center font-bold" style={{ borderColor: 'var(--color-border)' }}>
                                                {participant.totalScore} / {quiz.questions.length}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Admin Dashboard
const AdminDashboard = () => {
    const [currentView, setCurrentView] = useState('dashboard');
    const [quizzes, setQuizzes] = useState([]);
    const [selectedQuiz, setSelectedQuiz] = useState(null);
    const [activeSession, setActiveSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = db.collection('quizzes')
            .where('createdBy', '==', auth.currentUser.uid)
            .orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                const quizData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setQuizzes(quizData);
                setLoading(false);
            });

        return unsubscribe;
    }, []);

    const createLiveSession = async (quiz) => {
        try {
            const sessionRef = await db.collection('liveSession').add({
                quizId: quiz.id,
                status: 'waiting',
                currentQuestionIndex: -1,
                responses: {},
                createdAt: new Date()
            });
            
            setSelectedQuiz(quiz);
            setActiveSession(sessionRef.id);
            setCurrentView('control');
            showNotification('Live session created!', 'success');
        } catch (error) {
            showNotification('Error creating session: ' + error.message, 'error');
        }
    };

    const handleQuizCreated = (quizId) => {
        setCurrentView('dashboard');
    };

    const handleEndQuiz = () => {
        setCurrentView('results');
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="spinner border-4 border-blue-600 border-t-transparent rounded-full w-8 h-8"></div>
                <span className="ml-3">Loading dashboard...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex-1" style={{ backgroundColor: 'var(--color-background)' }}>
            <nav style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center space-x-4">
                            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Admin Dashboard</h1>
                            <div className="hidden sm:flex space-x-2">
                                <button
                                    onClick={() => setCurrentView('dashboard')}
                                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                                        currentView === 'dashboard' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                                    }`}
                                    style={{ color: currentView === 'dashboard' ? undefined : 'var(--color-text-secondary)' }}
                                >
                                    Dashboard
                                </button>
                                <button
                                    onClick={() => setCurrentView('create')}
                                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                                        currentView === 'create' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                                    }`}
                                    style={{ color: currentView === 'create' ? undefined : 'var(--color-text-secondary)' }}
                                >
                                    Create Quiz
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="py-8">
                {currentView === 'dashboard' && (
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="mb-8">
                            <h2 className="text-2xl font-bold mb-6">Your Quizzes</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {quizzes.map(quiz => (
                                    <div key={quiz.id} className="dashboard-card">
                                        <h3 className="text-lg font-semibold mb-2">{quiz.title}</h3>
                                        <p style={{ color: 'var(--color-text-secondary)' }} className="mb-4">
                                            {quiz.questions?.length || 0} questions
                                        </p>
                                        <button
                                            onClick={() => createLiveSession(quiz)}
                                            className="btn btn--primary w-full"
                                        >
                                            Start Live Session
                                        </button>
                                    </div>
                                ))}
                                {quizzes.length === 0 && (
                                    <div className="col-span-full text-center py-12">
                                        <p style={{ color: 'var(--color-text-secondary)' }} className="text-lg mb-4">
                                            No quizzes yet
                                        </p>
                                        <button
                                            onClick={() => setCurrentView('create')}
                                            className="btn btn--primary"
                                        >
                                            Create Your First Quiz
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {currentView === 'create' && (
                    <QuizCreator onQuizCreated={handleQuizCreated} />
                )}

                {currentView === 'control' && selectedQuiz && activeSession && (
                    <QuizControlPanel 
                        quiz={selectedQuiz} 
                        sessionId={activeSession} 
                        onEndQuiz={handleEndQuiz}
                    />
                )}

                {currentView === 'results' && selectedQuiz && activeSession && (
                    <QuizResults quiz={selectedQuiz} sessionId={activeSession} />
                )}
            </main>
        </div>
    );
};

// Participant Components
const ParticipantLobby = () => {
    return (
        <div className="min-h-screen flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
            <div className="text-center">
                <div className="pulse">
                    <div className="w-16 h-16 rounded-full mx-auto mb-6" style={{ backgroundColor: 'var(--color-primary)' }}></div>
                </div>
                <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--color-text)' }}>Waiting for Quiz to Start</h2>
                <p style={{ color: 'var(--color-text-secondary)' }}>Please wait for the admin to start the quiz.</p>
            </div>
        </div>
    );
};

const QuestionDisplay = ({ question, questionIndex, onAnswer, hasAnswered }) => {
    const [selectedAnswers, setSelectedAnswers] = useState([]);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        setSelectedAnswers([]);
        setSubmitted(false);
    }, [questionIndex]);

    const handleOptionClick = (option) => {
        if (submitted || hasAnswered) return;

        setSelectedAnswers(prev => {
            if (prev.includes(option)) {
                return prev.filter(a => a !== option);
            } else {
                return [...prev, option];
            }
        });
    };

    const submitAnswer = () => {
        if (selectedAnswers.length === 0 || submitted) return;
        
        setSubmitted(true);
        onAnswer(selectedAnswers);
    };

    if (hasAnswered || submitted) {
        return (
            <div className="min-h-screen flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
                <div className="text-center">
                    <div className="w-16 h-16 bg-green-600 rounded-full mx-auto mb-6 flex items-center justify-center">
                        <span className="text-white text-2xl">✓</span>
                    </div>
                    <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--color-text)' }}>Answer Submitted!</h2>
                    <p style={{ color: 'var(--color-text-secondary)' }}>Waiting for the next question...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex-1 py-8" style={{ backgroundColor: 'var(--color-background)' }}>
            <div className="max-w-2xl mx-auto px-4">
                <div className="question-card card">
                    <div className="card__body">
                        <div className="mb-6">
                            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Question {questionIndex + 1}</span>
                            <h2 className="text-2xl font-bold mt-2" style={{ color: 'var(--color-text)' }}>{question.questionText}</h2>
                        </div>

                        <div className="space-y-3 mb-6">
                            {question.options.map((option, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleOptionClick(option)}
                                    className={`answer-option w-full p-4 text-left border rounded-lg transition-all ${
                                        selectedAnswers.includes(option) 
                                            ? 'border-blue-500' 
                                            : 'hover:bg-gray-50'
                                    }`}
                                    style={{ 
                                        backgroundColor: selectedAnswers.includes(option) ? 'var(--color-bg-1)' : 'var(--color-surface)',
                                        borderColor: selectedAnswers.includes(option) ? 'var(--color-primary)' : 'var(--color-border)',
                                        color: 'var(--color-text)'
                                    }}
                                >
                                    <div className="flex items-center">
                                        <div className={`w-4 h-4 border-2 rounded mr-3 ${
                                            selectedAnswers.includes(option)
                                                ? 'border-blue-500 bg-blue-500'
                                                : ''
                                        }`}
                                        style={{
                                            borderColor: selectedAnswers.includes(option) ? 'var(--color-primary)' : 'var(--color-border)',
                                            backgroundColor: selectedAnswers.includes(option) ? 'var(--color-primary)' : 'transparent'
                                        }}>
                                            {selectedAnswers.includes(option) && (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <span className="text-white text-xs">✓</span>
                                                </div>
                                            )}
                                        </div>
                                        {option}
                                    </div>
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={submitAnswer}
                            disabled={selectedAnswers.length === 0}
                            className="btn btn--primary w-full"
                        >
                            Submit Answer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ParticipantEndScreen = ({ score, totalQuestions, rank }) => {
    return (
        <div className="min-h-screen flex-1 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
            <div className="text-center max-w-md mx-auto px-4">
                <div className="mb-8">
                    <div className="score-display text-6xl mb-4">{score}</div>
                    <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>Quiz Completed!</h2>
                    <p style={{ color: 'var(--color-text-secondary)' }}>You scored {score} out of {totalQuestions}</p>
                </div>

                <div className="card">
                    <div className="card__body">
                        <h3 className="text-lg font-semibold mb-4">Your Performance</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span>Correct Answers:</span>
                                <span className="font-bold">{score} / {totalQuestions}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Accuracy:</span>
                                <span className="font-bold">{Math.round((score / totalQuestions) * 100)}%</span>
                            </div>
                            {rank && (
                                <div className="flex justify-between">
                                    <span>Final Rank:</span>
                                    <span className="font-bold">#{rank}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => window.location.reload()}
                    className="btn btn--primary mt-6"
                >
                    Back to Lobby
                </button>
            </div>
        </div>
    );
};

// Participant View
const ParticipantView = () => {
    const [session, setSession] = useState(null);
    const [quiz, setQuiz] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [userResponses, setUserResponses] = useState({});
    const [loading, setLoading] = useState(true);
    const [finalResults, setFinalResults] = useState(null);

    useEffect(() => {
        // Listen for active sessions
        const unsubscribe = db.collection('liveSession')
            .where('status', 'in', ['waiting', 'active', 'finished'])
            .limit(1)
            .onSnapshot(async snapshot => {
                if (!snapshot.empty) {
                    const sessionDoc = snapshot.docs[0];
                    const sessionData = sessionDoc.data();
                    setSession({ id: sessionDoc.id, ...sessionData });

                    // Get quiz data
                    if (sessionData.quizId) {
                        try {
                            const quizDoc = await db.collection('quizzes').doc(sessionData.quizId).get();
                            if (quizDoc.exists) {
                                const quizData = quizDoc.data();
                                setQuiz(quizData);
                                
                                // Set current question
                                if (sessionData.currentQuestionIndex >= 0 && quizData.questions) {
                                    setCurrentQuestion(quizData.questions[sessionData.currentQuestionIndex]);
                                } else {
                                    setCurrentQuestion(null);
                                }

                                // Calculate final results if quiz is finished
                                if (sessionData.status === 'finished') {
                                    calculateFinalResults(sessionData, quizData);
                                }
                            }
                        } catch (error) {
                            console.error('Error fetching quiz:', error);
                        }
                    }
                }
                setLoading(false);
            });

        return unsubscribe;
    }, []);

    const calculateFinalResults = (sessionData, quizData) => {
        if (!sessionData.responses || !quizData) return;

        const userId = auth.currentUser.uid;
        let score = 0;
        let rank = 1;

        // Calculate user's score
        Object.entries(sessionData.responses).forEach(([questionIndex, responses]) => {
            const userResponse = responses[userId];
            if (userResponse && userResponse.correct) {
                score++;
            }
        });

        // Calculate rank (simplified - would need more complex logic for ties)
        const allUsers = new Set();
        Object.values(sessionData.responses).forEach(questionResponses => {
            Object.keys(questionResponses).forEach(uid => allUsers.add(uid));
        });

        const userScores = [];
        allUsers.forEach(uid => {
            let userScore = 0;
            Object.entries(sessionData.responses).forEach(([questionIndex, responses]) => {
                const response = responses[uid];
                if (response && response.correct) {
                    userScore++;
                }
            });
            userScores.push({ uid, score: userScore });
        });

        userScores.sort((a, b) => b.score - a.score);
        rank = userScores.findIndex(u => u.uid === userId) + 1;

        setFinalResults({
            score,
            totalQuestions: quizData.questions.length,
            rank
        });
    };

    const handleAnswer = async (selectedAnswers) => {
        if (!session || !quiz || !currentQuestion) return;

        const questionIndex = session.currentQuestionIndex;
        const correctAnswers = quiz.questions[questionIndex].correctAnswers;
        const isCorrect = selectedAnswers.every(ans => correctAnswers.includes(ans)) && 
                         correctAnswers.every(ans => selectedAnswers.includes(ans)) &&
                         selectedAnswers.length === correctAnswers.length;

        const responseData = {
            answer: selectedAnswers,
            timestamp: { seconds: Date.now() / 1000 },
            correct: isCorrect
        };

        try {
            await db.collection('liveSession').doc(session.id).update({
                [`responses.${questionIndex}.${auth.currentUser.uid}`]: responseData
            });

            setUserResponses(prev => ({
                ...prev,
                [questionIndex]: responseData
            }));

            showNotification('Answer submitted!', 'success');
        } catch (error) {
            showNotification('Error submitting answer: ' + error.message, 'error');
        }
    };

    const hasAnsweredCurrent = () => {
        if (!session || session.currentQuestionIndex < 0) return false;
        return userResponses[session.currentQuestionIndex] || 
               (session.responses && 
                session.responses[session.currentQuestionIndex.toString()] && 
                session.responses[session.currentQuestionIndex.toString()][auth.currentUser.uid]);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner border-4 border-blue-600 border-t-transparent rounded-full w-8 h-8"></div>
                <span className="ml-3">Loading...</span>
            </div>
        );
    }

    if (!session) {
        return <ParticipantLobby />;
    }

    if (session.status === 'finished' && finalResults) {
        return <ParticipantEndScreen {...finalResults} />;
    }

    if (session.status === 'waiting' || !currentQuestion) {
        return <ParticipantLobby />;
    }

    return (
        <QuestionDisplay
            question={currentQuestion}
            questionIndex={session.currentQuestionIndex}
            onAnswer={handleAnswer}
            hasAnswered={hasAnsweredCurrent()}
        />
    );
};

// Main App Component
const App = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            setUser(user);
            setIsAdmin(user?.uid === ADMIN_UID);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const handleLogout = async () => {
        await auth.signOut();
        setUser(null);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner border-4 border-blue-600 border-t-transparent rounded-full w-8 h-8"></div>
                <span className="ml-3">Loading...</span>
            </div>
        );
    }

    if (!user) {
        return <AuthComponent onAuthChange={setUser} />;
    }

    return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
            <header className="w-full border-b flex justify-end items-center px-4 h-14" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                <span className="mr-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {user.displayName || user.email}
                </span>
                <button className="btn btn--outline btn--sm" onClick={handleLogout}>
                    Logout
                </button>
            </header>
            <div className="flex-1 flex flex-col">
                {isAdmin ? <AdminDashboard /> : <ParticipantView />}
            </div>
        </div>
    );
};

// Render the app
ReactDOM.render(<App />, document.getElementById('root'));