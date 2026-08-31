import React, { useState, useEffect, useRef, useMemo } from 'react';
import Markdown from 'react-markdown';
import { 
  Heart, 
  Users, 
  MessageSquare, 
  LineChart, 
  BookOpen, 
  Brain, 
  UserCircle,
  Menu,
  ChevronRight,
  ChevronLeft,
  Stethoscope,
  HeartPulse,
  Send,
  Zap,
  Activity,
  Award,
  PenTool,
  LogOut,
  Save,
  Clock,
  History as HistoryIcon,
  Download,
  Mic,
  MicOff,
  RotateCcw,
  CircleCheck,
  CircleAlert,
  Info,
  Trash2,
  Volume2,
  VolumeX,
  FileText,
  Image as ImageIcon,
  X,
  Monitor,
  Database,
  Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import { 
  PATIENT_PERSONAS, 
  chatWithPatient, 
  analyzeEmpathy, 
  generateSoapNote,
  teamCollaborationChat,
  getSimulationHint,
  generateCrossSessionInsight,
  PatientPersona,
  ClinicalArtifact
} from './lib/gemini';
import { CaseSelection } from './components/CaseSelection';
import { db, auth, signInWithGoogle } from './lib/firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
  writeBatch,
  limit
} from 'firebase/firestore';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

type Role = 'Doctor' | 'Nurse' | 'SocialWorker' | 'Psychologist';

const ROLE_MAP: Record<Role, string> = {
  Doctor: '醫師',
  Nurse: '護理師',
  SocialWorker: '社工師',
  Psychologist: '心理師'
};

type Tab = 'Ward' | 'Simulation' | 'Reflections' | 'History' | 'ManualReview' | 'Analysis';
type WorkflowStep = 'landing' | 'setupPatient' | 'setupRole' | 'simulation';

interface ChatMessage {
  role: 'user' | 'model';
  roleName: string;
  text: string;
  timestamp: Date;
  isHint?: boolean;
}

const safeGetDateString = (s: any) => {
  if (!s || !s.createdAt) return '未知時間';
  if (typeof s.createdAt.toDate === 'function') {
    return s.createdAt.toDate().toLocaleDateString();
  }
  const date = new Date(s.createdAt);
  if (!isNaN(date.getTime())) {
    return date.toLocaleDateString();
  }
  return '未知時間';
};

const MedilogueLogo = ({ className = "w-24 h-24", id }: { className?: string, id?: string }) => (
  <svg id={id} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${className}`}>
    <defs>
      <linearGradient id="logoPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6C9A8B" />
        <stop offset="100%" stopColor="#2E6B56" />
      </linearGradient>
      <linearGradient id="logoAccent" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#D4A373" />
        <stop offset="100%" stopColor="#B88A5E" />
      </linearGradient>
    </defs>
    
    <path d="M15 35 C15 21.1929 26.1929 10 40 10 H60 C73.8071 10 85 21.1929 85 35 V55 C85 68.8071 73.8071 80 60 80 H50 L25 95 V80 C19.4772 80 15 75.5228 15 70 V35 Z" fill="url(#logoPrimary)" />
    <path d="M 22 47 L 28 47 L 35 28 L 42 55 L 49 28 L 56 47 L 62 47" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M60 50 C60 41.7157 66.7157 35 75 35 C83.2843 35 90 41.7157 90 50 V65 C90 70.5228 85.5228 75 80 75 V85 L65 75 H60 Z" fill="url(#logoAccent)" />
    <circle cx="70" cy="55" r="3.5" fill="white" />
    <circle cx="80" cy="55" r="3.5" fill="white" />
  </svg>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Simulation');
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('landing');
  const [selectedRole, setSelectedRole] = useState<Role>('Doctor');
  const [selectedPatient, setSelectedPatient] = useState<PatientPersona>(PATIENT_PERSONAS[0]);
  const [selectedArtifact, setSelectedArtifact] = useState<ClinicalArtifact | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [wardHistory, setWardHistory] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [wardInput, setWardInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLearningMode, setIsLearningMode] = useState(false);
  const [isStressTestMode, setIsStressTestMode] = useState(false);
  const [isGettingHint, setIsGettingHint] = useState(false);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [insightReport, setInsightReport] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [latestEvaluation, setLatestEvaluation] = useState<any>(null);
  const [soapNote, setSoapNote] = useState<string | null>(null);
  const [isGeneratingSoap, setIsGeneratingSoap] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [painLevel, setPainLevel] = useState<number | null>(null);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [activeTutorHint, setActiveTutorHint] = useState<{ title: string; content: string; type: 'clinical' | 'ethical' | 'warning' } | null>(null);
  const [shownHints, setShownHints] = useState<string[]>([]);
  const [isIntruding, setIsIntruding] = useState(false);

  useEffect(() => {
    let interval: any;
    if (timerActive) {
      interval = setInterval(() => {
        setSessionTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const calculatePainLevelChange = (patientId: string, currentLevel: number, text: string): number => {
    let change = 0;
    
    if (patientId === 'p7') {
      // Original Aminah case: automatic increase unless helpful keywords
      change = 10;
      const helpfulKeywords = ['通譯', '翻譯', '護理師', '女醫師', '社工', 'Chaperone', '陪伴', '女醫', '女性', '同性', '通話', '電聯'];
      if (helpfulKeywords.some(kw => text.includes(kw))) {
        change = -10;
      }
    } else if (patientId === 'p8') {
      // Lin Yu-chen (Athlete): Situational
      const negativeKeywords = ['截肢', '切掉', '不能跑', '腫瘤', '骨肉瘤', '放棄', '沒辦法'];
      const positiveKeywords = ['陪伴', '努力', '一起', '了解', '加油', '尊重', '聽你說'];
      
      if (negativeKeywords.some(kw => text.includes(kw))) {
        change = 15;
      } else if (positiveKeywords.some(kw => text.includes(kw))) {
        change = -10;
      }
    } else if (patientId === 'p9') {
      // Mrs. Zhang (Anxious): Situational
      const negativeKeywords = ['聽我的', '不要吵', '安靜', '劑量沒錯', '我是醫師'];
      const positiveKeywords = ['核對', '安全', '謝謝提醒', '陳姐', '流程', '解釋'];
      
      if (negativeKeywords.some(kw => text.includes(kw))) {
        change = 15;
      } else if (positiveKeywords.some(kw => text.includes(kw))) {
        change = -10;
      }
    } else if (patientId === 'p10') {
      const negativeKeywords = ['法律', '簽過', '同意書', '大愛', '救人', '道德', '必須', '不可以反悔'];
      const positiveKeywords = ['了解您的痛苦', '保護志明', '看見他的善良', '生命的延續', '圓滿', '最後的告別', '陪他一下'];
      
      if (negativeKeywords.some(kw => text.includes(kw))) {
        change = 15;
      } else if (positiveKeywords.some(kw => text.includes(kw))) {
        change = -10;
      }
    } else if (patientId === 'p11') {
      // Akai (Drug addict): Stigma vs Empathy
      const negativeKeywords = ['吸毒', '列管', '騙藥', '這種人', '沒錯', '規矩', '規定', '戒癮', '自己造成'];
      const positiveKeywords = ['相信你', '非常痛', '治療安全', '交互作用', '理解您的辛苦', '幫你處理'];
      
      if (negativeKeywords.some(kw => text.includes(kw))) {
        change = 15;
      } else if (positiveKeywords.some(kw => text.includes(kw))) {
        change = -10;
      }
    } else {
        // Default small increase for other cases if they had meter
        change = 2;
    }
    
    return Math.max(0, Math.min(100, currentLevel + change));
  };
  const isStartingSession = useRef(false);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedPastSession, setSelectedPastSession] = useState<any>(null);
  const [pastMessages, setPastMessages] = useState<any[]>([]);
  const [selectedPastEvaluation, setSelectedPastEvaluation] = useState<any>(null);
  const [selectedPastReflection, setSelectedPastReflection] = useState<any>(null);
  const [reflectionText, setReflectionText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isWardRecording, setIsWardRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [autoTTS, setAutoTTS] = useState(false);
  const recognitionRef = useRef<any>(null);

  const handleSpeak = (text: string, patient: any) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      // Remove parenthesis and their content
      const cleanText = text.replace(/（.*?）|\(.*?\)/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'zh-TW';
      
      let rate = 1.0;
      let pitch = 1.0;
      let gender: 'male' | 'female' | 'unknown' = 'unknown';

      if (patient?.voiceSettings) {
         pitch = patient.voiceSettings.pitch;
         rate = patient.voiceSettings.rate;
         gender = patient.voiceSettings.gender;
      } else if (patient) {
        if (patient.age > 65) {
          rate = 0.85;
          pitch = 0.9;
        } else if (patient.age < 18) {
          rate = 1.15;
          pitch = 1.3;
        }
        
        const avatar = patient.avatar || '';
        const name = patient.name || '';
        if (avatar.includes('👩') || avatar.includes('🧕') || avatar.includes('👵') || avatar.includes('👧') || name.includes('小姐') || name.includes('太太') || name.includes('媽媽') || name.includes('阿嬤') || name.includes('奶奶')) {
          pitch += 0.2;
          gender = 'female';
        } else if (avatar.includes('👨') || avatar.includes('👴') || avatar.includes('👦') || name.includes('先生') || name.includes('伯伯') || name.includes('爸爸') || name.includes('阿公') || name.includes('爺爺')) {
          pitch -= 0.2;
          gender = 'male';
        }
      }
      
      utterance.rate = Math.max(0.1, Math.min(2, rate));
      utterance.pitch = Math.max(0, Math.min(2, pitch));

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        let zhVoices = voices.filter(v => v.lang.toLowerCase().includes('zh'));
        if (zhVoices.length === 0) zhVoices = voices;

        let selectedVoice = null;
        if (gender === 'female') {
          selectedVoice = zhVoices.find(v => /female|woman|girl|xiaoxiao|yating|mei-jia|ting-ting|ya-ling/i.test(v.name)) || 
                          zhVoices.find(v => /tw/i.test(v.lang)); // Default TW voice is usually female
        } else if (gender === 'male') {
          selectedVoice = zhVoices.find(v => /male|man|boy|yunjian|yunxi|zhiwei/i.test(v.name));
        }

        if (selectedVoice) {
          utterance.voice = selectedVoice;
        } else if (zhVoices.length > 0) {
          utterance.voice = zhVoices.find(v => v.lang.toLowerCase().includes('tw')) || zhVoices[0];
        }
      }
      
      window.speechSynthesis.speak(utterance);
    } else {
      setSpeechError('您的瀏覽器不支援語音合成功能');
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setIsWardRecording(false);
  };

  const startSpeechRecognition = (target: 'simulation' | 'ward') => {
    if (isRecording || isWardRecording) {
      stopSpeechRecognition();
      return;
    }

    setSpeechError(null);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('您的瀏覽器不支援語音辨識服務');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'zh-TW';
    recognition.interimResults = false;

    if (target === 'simulation') {
      setIsRecording(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => prev + transcript);
      };
      recognition.onend = () => {
        setIsRecording(false);
        recognitionRef.current = null;
      };
    } else {
      setIsWardRecording(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setWardInput(prev => prev + transcript);
      };
      recognition.onend = () => {
        setIsWardRecording(false);
        recognitionRef.current = null;
      };
    }

    recognition.onerror = (event: any) => {
      // Quietly handle certain expected 'errors'
      if (event.error === 'no-speech') {
        console.warn('Speech recognition: no speech detected.');
      } else if (event.error === 'aborted') {
        console.warn('Speech recognition: aborted.');
      } else if (event.error === 'not-allowed') {
        setSpeechError('語音權限被拒絕。請確保已允許使用麥克風。若因內嵌視窗限制而失效，請點擊右邊按鈕以「在新分頁中開啟」應用程式練習。');
        console.error('Speech recognition error:', event.error);
      } else {
        setSpeechError('語音辨識錯誤: ' + event.error);
        console.error('Speech recognition error:', event.error);
      }
      
      setIsRecording(false);
      setIsWardRecording(false);
      recognitionRef.current = null;
    };

    recognition.start();
  };

  const handleGenerateInsight = async () => {
    if (!user || pastSessions.length === 0 || isGeneratingInsight) return;
    setIsGeneratingInsight(true);
    try {
      // Fetch latest evaluations for the user
      const qEval = query(
        collection(db, 'evaluations'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const evalSnap = await getDocs(qEval);
      const recentEvals = evalSnap.docs.map(doc => doc.data());
      
      if (recentEvals.length === 0) {
        alert('目前尚未有足夠的學習評價紀錄，請先完成幾次練習再來試試看哦！');
        return;
      }
      
      const insight = await generateCrossSessionInsight(recentEvals);
      setInsightReport(insight);
    } catch (e) {
      console.error('Failed to generate insight:', e);
      alert('無法產生洞察報告，請確認網路連線。');
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const handleGetHint = async () => {
    if (isGettingHint || isTyping || !selectedPatient) return;
    setIsGettingHint(true);
    
    try {
      const transcript = chatHistory
        .filter(m => !m.isHint)
        .map(m => `${m.roleName || (m.role === 'user' ? '醫師' : selectedPatient.name)}: ${m.text}`)
        .join('\n');

      const hint = await getSimulationHint(selectedPatient, transcript);
      
      setChatHistory(prev => [...prev, { 
        role: 'model', 
        roleName: '導師', 
        text: `💡 導師提示：${hint || '暫無提示'}`, 
        timestamp: new Date(), 
        isHint: true 
      }]);
    } catch (error) {
      console.error("Error getting hint:", error);
    } finally {
      setIsGettingHint(false);
    }
  };

  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('All');
  const [expandedMode, setExpandedMode] = useState<'details' | 'reflection' | null>(null);

  const handleSaveReflection = async (targetSid?: string) => {
    if (!reflectionText.trim() || !user) return;

    let currentSid = targetSid || sessionIdRef.current;
    
    // If no session but one is being started, wait a bit
    let retries = 0;
    while (!currentSid && isStartingSession.current && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      currentSid = sessionIdRef.current;
      retries++;
    }

    if (!currentSid) {
      alert('無法找到對應的對話 session。');
      return;
    }
    
    try {
      if (selectedPastReflection && selectedPastSession?.id === currentSid) {
        // Update existing reflection
        await updateDoc(doc(db, 'reflections', selectedPastReflection.id), {
          content: reflectionText,
          updatedAt: serverTimestamp()
        });
        setSelectedPastReflection({ ...selectedPastReflection, content: reflectionText });
      } else {
        const docRef = await addDoc(collection(db, 'reflections'), {
          userId: user.uid,
          sessionId: currentSid,
          content: reflectionText,
          createdAt: serverTimestamp()
        });
        if (selectedPastSession?.id === currentSid) {
          setSelectedPastReflection({ id: docRef.id, content: reflectionText });
        }
      }
      alert('反思日誌已成功儲存！');
      // Always reset expandedMode after saving from inline if there was a selected past session
      if (selectedPastSession && currentSid === selectedPastSession.id && activeTab === 'History') {
          setExpandedMode(null);
      } else if (!selectedPastSession || currentSid !== selectedPastSession.id) {
         setReflectionText(''); 
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'reflections');
    }
  };
  
  const REFLECTION_PROMPTS = [
    "在這個案例中，有哪些轉折點讓你印象深刻？",
    "若重新處理，你會採取什麼不同的溝通方式？",
    "患者的情緒有何變化？你如何回應這些情緒？",
    "跨領域團隊協作中，你的角色發揮了什麼作用？"
  ];
  const [showPrompt, setShowPrompt] = useState(false);
  const randomPrompt = useMemo(() => REFLECTION_PROMPTS[Math.floor(Math.random() * REFLECTION_PROMPTS.length)], [showPrompt, expandedMode]);

  const toggleExpandMode = (mode: 'details' | 'reflection', session: any) => {
    if (selectedPastSession?.id === session.id && expandedMode === mode) {
      setExpandedMode(null);
    } else {
      if (selectedPastSession?.id !== session.id) {
        fetchSessionDetails(session);
      }
      setExpandedMode(mode);
    }
  };
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wardEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isTyping]);

  useEffect(() => {
    if ((activeTab === 'History' || activeTab === 'Reflections' || activeTab === 'ManualReview') && user) {
      fetchSessions();
    }
  }, [activeTab, user]);

  const fetchSessions = async () => {
    if (!user) return;
    setLoadingSessions(true);
    try {
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const sessions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPastSessions(sessions);
    } catch (e) {
      console.error("Error fetching sessions:", e);
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchSessionDetails = async (session: any) => {
    setSelectedPastSession(session);
    setPastMessages([]);
    setSelectedPastEvaluation(null);
    setSelectedPastReflection(null);
    try {
      const qMsgs = query(collection(db, `sessions/${session.id}/messages`), orderBy('timestamp', 'asc'));
      const msgSnap = await getDocs(qMsgs);
      setPastMessages(msgSnap.docs.map(doc => doc.data()));

      const qEval = query(
        collection(db, 'evaluations'), 
        where('userId', '==', user.uid),
        where('sessionId', '==', session.id)
      );
      const evalSnap = await getDocs(qEval);
      if (!evalSnap.empty) setSelectedPastEvaluation({ ...evalSnap.docs[0].data(), id: evalSnap.docs[0].id });

      const qRefl = query(
        collection(db, 'reflections'), 
        where('userId', '==', user.uid),
        where('sessionId', '==', session.id)
      );
      const reflSnap = await getDocs(qRefl);
      if (!reflSnap.empty) {
        const refData = reflSnap.docs[0].data();
        setSelectedPastReflection({ ...refData, id: reflSnap.docs[0].id });
        setReflectionText(refData.content || '');
      } else {
        setReflectionText('');
      }
    } catch (e) {
      console.error("Error fetching practice details:", e);
    }
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDeleteSession = async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) {
      alert('請先登入');
      return;
    }
    if (isDeleting) {
      console.log('Already deleting a session');
      return;
    }
    
    const confirmDelete = window.confirm('確定要刪除這筆練習紀錄嗎？此動作無法復原。');
    if (!confirmDelete) return;

    setIsDeleting(sid);
    try {
      console.log(`Starting deletion for session: ${sid}`);
      
      // 1. Get messages to delete
      const msgRef = collection(db, 'sessions', sid, 'messages');
      const msgSnap = await getDocs(msgRef);
      console.log(`Found ${msgSnap.size} messages to delete`);
      
      // 2. Get evaluations to delete
      const evalRef = collection(db, 'evaluations');
      const evalQuery = query(evalRef, where('sessionId', '==', sid), where('userId', '==', user.uid));
      const evalSnap = await getDocs(evalQuery);
      console.log(`Found ${evalSnap.size} evaluations to delete`);

      // 3. Get reflections to delete
      const reflRef = collection(db, 'reflections');
      const reflQuery = query(reflRef, where('sessionId', '==', sid), where('userId', '==', user.uid));
      const reflSnap = await getDocs(reflQuery);
      console.log(`Found ${reflSnap.size} reflections to delete`);

      // 4. Execute atomic batch deletion
      const batch = writeBatch(db);
      msgSnap.forEach(d => batch.delete(d.ref));
      evalSnap.forEach(d => batch.delete(d.ref));
      reflSnap.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'sessions', sid));

      await batch.commit();
      console.log('Deletion successful');

      // Update local state
      setPastSessions(prev => prev.filter(s => s.id !== sid));
      if (selectedPastSession?.id === sid) {
        setSelectedPastSession(null);
        setPastMessages([]);
        setSelectedPastEvaluation(null);
        setSelectedPastReflection(null);
        setExpandedMode(null);
      }
      alert('紀錄已成功刪除');
    } catch (err) {
      console.error('Failure deleting session:', err);
      alert(`刪除失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const startNewSession = async (type: 'individual' | 'team') => {
    if (!user || isStartingSession.current) {
      console.log('Session start skipped: already starting or no user');
      return null;
    }
    
    isStartingSession.current = true;
    try {
      console.log(`Starting new ${type} session for user ${user.uid}`);
      const sessionData = {
        userId: user.uid,
        patientId: selectedPatient.id,
        type,
        userRole: selectedRole,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      const newId = docRef.id;
      
      console.log(`Session created with ID: ${newId}`);
      setSessionId(newId);
      sessionIdRef.current = newId;
      setSessionTimer(0);
      setTimerActive(true);
      
      if (selectedPatient.initialPainLevel !== undefined) {
        setPainLevel(selectedPatient.initialPainLevel);
      } else {
        setPainLevel(null);
      }
      
      return newId;
    } catch (e) {
      console.error('Error in startNewSession:', e);
      // If we get an already exists error, it's very strange for addDoc.
      // We'll throw it to be handled by the caller.
      throw e;
    } finally {
      isStartingSession.current = false;
    }
  };

  const saveMessage = async (sid: string, msg: ChatMessage) => {
    try {
      await addDoc(collection(db, `sessions/${sid}/messages`), {
        ...msg,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `sessions/${sid}/messages`);
    }
  };

  const handleSendMessage = async () => {
    if (isTyping) return;
    const messageText = inputText.trim();
    if (!messageText || !user) return;
    
    setInputText('');
    setIsTyping(true);

    let currentSid = sessionIdRef.current;
    if (!currentSid && !isStartingSession.current) {
      try {
        currentSid = await startNewSession('individual');
      } catch (err) {
        setIsTyping(false);
        handleFirestoreError(err, OperationType.CREATE, 'sessions');
        return;
      }
    }
    
    // If still no session but one is being started, wait a bit
    let retries = 0;
    while (!currentSid && isStartingSession.current && retries < 15) {
      await new Promise(resolve => setTimeout(resolve, 500));
      currentSid = sessionIdRef.current;
      retries++;
    }
    
    if (!currentSid) {
      console.error('Failed to obtain a valid session ID after retries');
      setIsTyping(false);
      alert('無法建立練習階段，請檢查網路連線或重新整理頁面。');
      return;
    }

    const userMessage: ChatMessage = { 
      role: 'user', 
      roleName: '醫師',
      text: messageText, 
      timestamp: new Date() 
    };
    
    setChatHistory(prev => [...prev, userMessage]);
    saveMessage(currentSid, userMessage);

    // AI Tutor Intervention Logic
    const tutorLogic = (currentPain: number | null, text: string) => {
      if (currentPain !== null) {
        if (currentPain >= 40 && currentPain < 80 && !shownHints.includes('pain_40')) {
          setActiveTutorHint({
            title: '💡 臨床觀察點：疼痛外在化',
            content: '患者的痛苦已經開始影響對話進度。除了技術性處置，您是否考慮過環境壓力或文化焦慮可能加劇了生理症狀？試著詢問患者當下最擔心的事。',
            type: 'clinical'
          });
          setShownHints(prev => [...prev, 'pain_40']);
        } else if (currentPain >= 85 && currentPain < 100 && !shownHints.includes('pain_80')) {
          setActiveTutorHint({
            title: '🚨 關鍵決策時刻：預立醫療介入',
            content: '指標顯示病患已接近臨界點。在團隊合作中，誰應該主導溝通？除了急救，如何同時維持病患的自主權與文化尊嚴？請立即協調院內資源。',
            type: 'warning'
          });
          setShownHints(prev => [...prev, 'pain_80']);
        }
      }

      // Case 8 specific triggers (Lin Yu-chen & Father)
      if (selectedPatient.id === 'p8' && (text.includes('腫瘤') || text.includes('截肢') || text.includes('癌症')) && !shownHints.includes('p8_father_intrusion')) {
        setActiveTutorHint({
          title: '⚠️ 突發事件：情感風暴與家屬衝擊',
          content: '壞消息告知引發了家屬的激烈反應。此時若與家屬爭執醫療專業，會讓衝突升級。請試著「暫停」臨床說服，優先接住家屬的憤怒與恐懼，並將對話重心移回病患的心理支持。',
          type: 'warning'
        });
        setShownHints(prev => [...prev, 'p8_father_intrusion']);
      }

      if (selectedPatient.id === 'p11' && (text.includes('吸毒') || text.includes('列管') || text.includes('騙藥')) && !shownHints.includes('p11_bias_alert')) {
        setActiveTutorHint({
          title: '🧠 臨床倫理反思：無意識偏見',
          content: '偵測到對話可能帶有道德評判或標籤化。對於藥癮病患，建立信賴的第一步是「懸置批判」。試著將焦點從「病患的行為瑕疵」轉移到「病患當下的痛苦與安全需求」上。',
          type: 'ethical'
        });
        setShownHints(prev => [...prev, 'p11_bias_alert']);
      }

      // Keyword based hints
      const sensitiveKeywords = ['痛', '死', '回家', '家人', '神', '拜', '誰'];
      if (sensitiveKeywords.some(kw => text.includes(kw)) && !shownHints.includes('empathy_ref')) {
        setActiveTutorHint({
          title: '⚖️ 倫理與文化思維',
          content: '當患者提到超自然信念或居家照顧需求時，避免僅以生物醫學邏輯回應。展現對其世界觀的尊重，有助於降低防禦心並建立真正的醫療盟友關係。',
          type: 'ethical'
        });
        setShownHints(prev => [...prev, 'empathy_ref']);
      }
    };

    let nextPainLevel = painLevel;
    if (selectedPatient.hasPainMeter && painLevel !== null) {
      nextPainLevel = calculatePainLevelChange(selectedPatient.id, painLevel, messageText);
      setPainLevel(nextPainLevel);
    }

    tutorLogic(nextPainLevel, messageText);

    let forceIntrusion = '';
    if (selectedPatient.id === 'p8' && (messageText.includes('腫瘤') || messageText.includes('截肢') || messageText.includes('癌症'))) {
      forceIntrusion = '請注意！林爸爸此刻正好在旁邊聽到你們的對話。他因聽聞負面消息而情緒失控並憤怒介入，請務必包含林爸爸的發言。';
      if (!shownHints.includes('p8_father_intrusion')) {
        setIsIntruding(true);
        setTimeout(() => setIsIntruding(false), 5000);
      }
    } else if (selectedPatient.id === 'p9' && !shownHints.includes('p9_nurse_interaction')) {
      forceIntrusion = '請務必包含護理師陳姐對這份醫囑劑量的質疑，以及張阿姨對醫院的不信任反應。';
      setShownHints(prev => [...prev, 'p9_nurse_interaction']);
    }

    try {
      const historyForGemini = chatHistory
        .filter(m => !m.isHint)
        .map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }));
      
      const response = await chatWithPatient(
        selectedPatient, 
        historyForGemini, 
        messageText, 
        nextPainLevel ?? undefined,
        forceIntrusion,
        isStressTestMode
      );
      
      const lines = response ? response.split('\n').filter(l => l.trim()) : [];
      let fullTextToSpeak = '';
      
      lines.forEach((line, index) => {
        let name = selectedPatient.name;
        let content = line;
        
        const nameMatch = line.match(/^\[(.*?)\]:\s*(.*)/);
        if (nameMatch) {
          name = nameMatch[1];
          content = nameMatch[2];
        }
        
        fullTextToSpeak += content + ' ';
        
        const aiMessage: ChatMessage = { 
          role: 'model', 
          roleName: name,
          text: content || '...', 
          timestamp: new Date(new Date().getTime() + index * 10) 
        };
        setChatHistory(prev => [...prev, aiMessage]);
        saveMessage(currentSid!, aiMessage);
      });
      
      if (autoTTS && fullTextToSpeak) {
        handleSpeak(fullTextToSpeak, selectedPatient);
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleWardMessage = async () => {
    if (isTyping) return;
    const messageText = wardInput.trim();
    if (!messageText || !user) return;
    
    setWardInput('');
    setIsTyping(true);

    let currentSid = sessionIdRef.current;
    if (!currentSid && !isStartingSession.current) {
      try {
        currentSid = await startNewSession('team');
      } catch (err) {
        setIsTyping(false);
        handleFirestoreError(err, OperationType.CREATE, 'sessions');
        return;
      }
    }
    
    // If still no session but one is being started, wait a bit
    let retries = 0;
    while (!currentSid && isStartingSession.current && retries < 15) {
      await new Promise(resolve => setTimeout(resolve, 500));
      currentSid = sessionIdRef.current;
      retries++;
    }
    
    if (!currentSid) {
      console.error('Failed to obtain a valid session ID for ward message after retries');
      setIsTyping(false);
      alert('無法建立團隊討論階段，請嘗試重新整理。');
      return;
    }

    const userMessage: ChatMessage = { 
      role: 'user', 
      roleName: ROLE_MAP[selectedRole],
      text: messageText, 
      timestamp: new Date() 
    };
    
    setWardHistory(prev => [...prev, userMessage]);
    saveMessage(currentSid, userMessage);

    // AI Tutor Intervention Logic
    const tutorLogic = (currentPain: number | null, text: string) => {
      if (currentPain !== null) {
        if (currentPain >= 40 && currentPain < 80 && !shownHints.includes('pain_40')) {
          setActiveTutorHint({
            title: '💡 臨床觀察點：疼痛外在化',
            content: '患者的痛苦已經開始影響對話進度。除了技術性處置，您是否考慮過環境壓力或文化焦慮可能加劇了生理症狀？試著詢問患者當下最擔心的事。',
            type: 'clinical'
          });
          setShownHints(prev => [...prev, 'pain_40']);
        } else if (currentPain >= 85 && currentPain < 100 && !shownHints.includes('pain_80')) {
          setActiveTutorHint({
            title: '🚨 關鍵決策時刻：預立醫療介入',
            content: '指標顯示病患已接近臨界點。在團隊合作中，誰應該主導溝通？除了急救，如何同時維持病患的自主權與文化尊嚴？請立即協調院內資源。',
            type: 'warning'
          });
          setShownHints(prev => [...prev, 'pain_80']);
        }
      }

      // Case 8 specific triggers (Lin Yu-chen & Father)
      if (selectedPatient.id === 'p8' && (text.includes('腫瘤') || text.includes('截肢') || text.includes('癌症')) && !shownHints.includes('p8_father_intrusion_ward')) {
        setActiveTutorHint({
          title: '⚠️ 突發事件：情感風暴與家屬衝擊',
          content: '壞消息告知引發了家屬的激烈反應。此時若與家屬爭執專業，會讓衝突升級。請優先處理家屬情緒，並引導團隊協作支持。',
          type: 'warning'
        });
        setShownHints(prev => [...prev, 'p8_father_intrusion_ward']);
      }

      // Keyword based hints
      const sensitiveKeywords = ['痛', '死', '回家', '家人', '神', '拜', '誰'];
      if (sensitiveKeywords.some(kw => text.includes(kw)) && !shownHints.includes('empathy_ref')) {
        setActiveTutorHint({
          title: '⚖️ 倫理與文化思維',
          content: '當患者提到超自然信念或居家照顧需求時，避免僅以生物醫學邏輯回應。展現對其世界觀的尊重，有助於降低防禦心並建立真正的醫療盟友關係。',
          type: 'ethical'
        });
        setShownHints(prev => [...prev, 'empathy_ref']);
      }
    };

    try {
      let teamRoles: string[] = (['Doctor', 'Nurse', 'SocialWorker', 'Psychologist'] as Role[])
        .filter(r => r !== selectedRole)
        .map(r => r === 'Doctor' ? '醫師' : r === 'Nurse' ? '護理師' : r === 'SocialWorker' ? '社工師' : '心理師');

      if (selectedPatient.id === 'p8') {
        teamRoles.push('家屬林爸爸');
      }
      if (selectedPatient.id === 'p9' && selectedRole === 'Doctor') {
        teamRoles = teamRoles.map(r => r === '護理師' ? '資深護理師陳姐' : r);
      }

      const historyForGemini = wardHistory
        .filter(m => !m.isHint)
        .map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }));
      
      let nextPainLevel = painLevel;
      if (selectedPatient.hasPainMeter && painLevel !== null) {
        nextPainLevel = calculatePainLevelChange(selectedPatient.id, painLevel, messageText);
        setPainLevel(nextPainLevel);
      }

      tutorLogic(nextPainLevel, messageText);

      let forceIntrusion = '';
      if (selectedPatient.id === 'p8' && (messageText.includes('腫瘤') || messageText.includes('截肢') || messageText.includes('癌症'))) {
        forceIntrusion = '請注意！林爸爸此刻突然闖入診間插話。他因聽聞消息而極度憤怒不信任醫護，請務必包含林爸爸的發言。';
        if (!shownHints.includes('p8_father_intrusion_ward')) {
          setIsIntruding(true);
          setTimeout(() => setIsIntruding(false), 5000);
        }
      }

      const response = await teamCollaborationChat(
        selectedPatient, 
        selectedRole, 
        historyForGemini, 
        messageText, 
        teamRoles,
        nextPainLevel ?? undefined,
        forceIntrusion
      );
      
      const lines = response ? response.split('\n').filter(l => l.trim()) : [];
      let fullWardTextToSpeak = '';
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        let name = '團隊成員';
        let content = trimmedLine;
        
        const nameMatch = trimmedLine.match(/^\[(.*?)\]:\s*(.*)/);
        if (nameMatch) {
          name = nameMatch[1];
          content = nameMatch[2];
        } else if (trimmedLine.startsWith('[') && trimmedLine.indexOf(']') > 0) {
          name = trimmedLine.split(']')[0].substring(1);
          content = trimmedLine.split(']')[1].replace(/^:\s*/, '');
        }

        fullWardTextToSpeak += content + ' ';

        const aiMsg: ChatMessage = { 
          role: 'model', 
          roleName: name,
          text: content || '...', 
          timestamp: new Date() 
        };
        setWardHistory(prev => [...prev, aiMsg]);
        saveMessage(currentSid!, aiMsg);
      });

      if (autoTTS && fullWardTextToSpeak) {
        handleSpeak(fullWardTextToSpeak, selectedPatient);
      }
    } catch (error) {
      console.error('Ward error:', error);
    } finally {
      setIsTyping(false);
    }
  };

  const finishSimulation = async () => {
    setTimerActive(false);
    if (sessionId) {
      try {
        await updateDoc(doc(db, 'sessions', sessionId), {
          status: 'completed',
          duration: sessionTimer,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `sessions/${sessionId}`);
      }
    }
  };

  const handleGenerateSoapNote = async () => {
    if (isGeneratingSoap || !analysis) return;
    setIsGeneratingSoap(true);
    setSoapNote(null);
    try {
      const isTeam = activeTab === 'Ward';
      const history = isTeam ? wardHistory : chatHistory;
      const transcript = history.map(m => `${m.roleName || (m.role === 'user' ? (isTeam ? ROLE_MAP[selectedRole] : '醫師') : selectedPatient.name)}: ${m.text}`).join('\n');
      const userRoleStr = isTeam ? ROLE_MAP[selectedRole] : '醫師';
      const patientContext = `患者：${selectedPatient.name}, 主訴：${selectedPatient.chiefComplaint}, 醫療摘要：${selectedPatient.medicalSummary}, 背景：${selectedPatient.background}`;
      const result = await generateSoapNote(transcript, isTeam, userRoleStr, patientContext, new Date().toLocaleString());
      setSoapNote(result);
      
      if (sessionId && user) {
        // We can optionally save it to Firestore, e.g. update the session or evaluation
        // Let's just update the evaluation document with the soapNote or add a new doc.
        // For simplicity, we just keep it in state, unless requested to save.
      }
    } catch (error) {
      console.error('SOAP Note error:', error);
    } finally {
      setIsGeneratingSoap(false);
    }
  };

  const handleGenerateSoapNotePast = async () => {
    if (isGeneratingSoap || !selectedPastSession || !selectedPastEvaluation || !selectedPastEvaluation.id) return;
    setIsGeneratingSoap(true);
    try {
      const isTeam = selectedPastSession.type === 'team';
      const patient = PATIENT_PERSONAS.find(p => p.id === selectedPastSession.patientId);
      if (!patient) return;
      const transcript = pastMessages.map(m => `${m.roleName || (m.role === 'user' ? (isTeam ? '醫療人員' : '醫師') : patient.name)}: ${m.text}`).join('\n');
      const patientContext = `患者：${patient.name}, 主訴：${patient.chiefComplaint}, 醫療摘要：${patient.medicalSummary}, 背景：${patient.background}`;
      let visitDate = safeGetDateString(selectedPastSession);
      if (selectedPastSession.createdAt && typeof selectedPastSession.createdAt.toDate === 'function') {
         visitDate = selectedPastSession.createdAt.toDate().toLocaleString();
      }
      const result = await generateSoapNote(transcript, isTeam, '醫師', patientContext, visitDate);
      
      await updateDoc(doc(db, 'evaluations', selectedPastEvaluation.id), {
        soapNote: result
      });
      setSelectedPastEvaluation({ ...selectedPastEvaluation, soapNote: result });
    } catch (error) {
      console.error('SOAP Note past error:', error);
    } finally {
      setIsGeneratingSoap(false);
    }
  };

  const handleAnalysis = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    setLatestEvaluation(null);
    try {
      const isTeam = activeTab === 'Ward';
      const history = isTeam ? wardHistory : chatHistory;
      const transcript = history.map(m => `${m.roleName || (m.role === 'user' ? (isTeam ? ROLE_MAP[selectedRole] : '醫師') : selectedPatient.name)}: ${m.text}`).join('\n');
      const userRoleStr = isTeam ? ROLE_MAP[selectedRole] : '醫師';
      const patientContext = `患者：${selectedPatient.name}, 主訴：${selectedPatient.chiefComplaint}, 醫療摘要：${selectedPatient.medicalSummary}, 背景：${selectedPatient.background}${selectedPatient.specialInstructions ? `, 特別指令/場景：${selectedPatient.specialInstructions}` : ''}`;
      const result = await analyzeEmpathy(transcript, isTeam, userRoleStr, patientContext);
      setAnalysis(result);
      setLatestEvaluation(result);
      
      if (sessionId && user) {
        await addDoc(collection(db, 'evaluations'), {
          ...result,
          userId: user.uid,
          sessionId,
          createdAt: serverTimestamp()
        });
      }
      setShowAnalysis(true);
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRequestHumanReview = async (sid: string | null) => {
    const idToUse = sid || sessionId;
    if (!idToUse || !user) return;
    
    try {
      await updateDoc(doc(db, 'sessions', idToUse), {
        humanReviewRequested: true,
        updatedAt: serverTimestamp()
      });
      alert('人工覆核請求已送出，導師將會收到您的申請。');
      
      // Update local state for history view if needed
      if (sid) {
        setPastSessions(prev => prev.map(s => s.id === sid ? { ...s, humanReviewRequested: true } : s));
        if (selectedPastSession?.id === sid) {
          setSelectedPastSession(prev => ({ ...prev, humanReviewRequested: true }));
        }
      } else {
        // Current active session
        setSessionId(idToUse);
        sessionIdRef.current = idToUse;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `sessions/${idToUse}`);
    }
  };

  const handleEndSession = async () => {
    await finishSimulation();
    await handleAnalysis();
  };

  const resetSim = (patientToUse?: PatientPersona) => {
    const patient = patientToUse || selectedPatient;
    const initialHistory: ChatMessage[] = [{
      role: 'model',
      roleName: patient.name,
      text: patient.openingLine,
      timestamp: new Date()
    }];

    if (patient.hasPainMeter) {
      initialHistory.push({
        role: 'model',
        roleName: '系統提示',
        text: '⚠️ 本案例啟動「生命徵象與壓力監測」。患者的生理及情緒狀態將反映在即時指標中。請運用您的專業護理倫理與溝通決策，評估並緩解患者的焦慮與痛苦，以避免病況惡化。',
        timestamp: new Date(),
        isHint: true
      });
    }

    setChatHistory(initialHistory);
    setWardHistory([]);
    setAnalysis(null);
    setLatestEvaluation(null);
    setShowAnalysis(false);
    setSessionId(null);
    sessionIdRef.current = null;
    setPainLevel(null);
    setSessionTimer(0);
    setTimerActive(false);
    setInputText('');
    setWardInput('');
  };

  const radarData = (analysis || latestEvaluation) ? [
    { subject: '人文關懷', A: (analysis || latestEvaluation).scores.humanity, fullMark: 100 },
    { subject: '專業素養', A: (analysis || latestEvaluation).scores.professionalism, fullMark: 100 },
    { subject: '溝通技巧', A: (analysis || latestEvaluation).scores.communication, fullMark: 100 },
    { subject: '共情深度', A: (analysis || latestEvaluation).scores.empathy, fullMark: 100 },
    { subject: '倫理決策', A: (analysis || latestEvaluation).scores.ethics, fullMark: 100 },
    ...((analysis || latestEvaluation).scores.interdisciplinary ? [{ subject: '跨科整合', A: (analysis || latestEvaluation).scores.interdisciplinary, fullMark: 100 }] : [])
  ] : [];

  const exportReport = (history: ChatMessage[], evalData: any) => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const patientName = selectedPatient?.name || '未知個案';
    const rating = evalData?.empathyLevel || '未評等';
    const safePatientName = patientName.replace(/[\\/:*?"<>|]/g, '-');
    const safeRating = rating.replace(/[\\/:*?"<>|]/g, '-');
    const fileName = `MEDILOGUE_分析報告_${dateStr}_${safePatientName}_${safeRating}.txt`;
    let content = `MEDILOGUE 練習報告\n`;
    content += `====================================\n`;
    content += `產出時間: ${new Date().toLocaleString()}\n`;
    content += `練習個案: ${selectedPatient.name}\n`;
    content += `練習類型: ${activeTab === 'Simulation' ? '擬真診間' : '團隊協作'}\n`;
    content += `練習時間: ${formatTime(sessionTimer)}\n`;
    content += `扮演角色: ${selectedRole}\n\n`;
    
    content += `【對話紀錄實錄】\n`;
    content += `------------------------------------\n`;
    history.forEach(m => {
      content += `${m.roleName}: ${m.text}\n`;
    });
    content += `\n`;
    
    if (evalData) {
      content += `【AI 人文導師深度評估】\n`;
      content += `------------------------------------\n`;
      content += `綜合評等: ${evalData.empathyLevel}\n\n`;
      content += `各項評分:\n`;
      Object.entries(evalData.scores).forEach(([key, val]) => {
        content += `- ${key}: ${val}\n`;
      });
      content += `\n優點 (Strengths):\n`;
      (evalData.strengths || []).forEach((item: string, i: number) => {
        content += `${i+1}. ${item}\n`;
      });
      content += `\n缺點/待改進 (Weaknesses):\n`;
      (evalData.weaknesses || []).forEach((item: string, i: number) => {
        content += `${i+1}. ${item}\n`;
      });
      content += `\n改進建議:\n`;
      (evalData.suggestions || []).forEach((s: string, i: number) => {
        content += `${i+1}. ${s}\n`;
      });
      if (evalData.patientVoice) {
        content += `\n病患心聲:\n"${evalData.patientVoice}"\n`;
      }
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportSoapNote = (soapContent: string, patientName: string) => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const safePatientName = patientName.replace(/[\\/:*?"<>|]/g, '-');
    const fileName = `MEDILOGUE_SOAP_${dateStr}_${safePatientName}.txt`;
    
    let content = `MEDILOGUE SOAP Note 病歷紀錄\n`;
    content += `====================================\n`;
    content += `產出時間: ${new Date().toLocaleString()}\n`;
    content += `練習個案: ${patientName}\n\n`;
    content += `${soapContent}\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-[100dvh] w-[100dvw] overflow-hidden p-2 sm:p-4 bg-medical-soft/40 flex flex-col font-sans text-[#3D3D3D]">
      <div className="flex-1 overflow-hidden flex flex-col medical-grid bg-medical-bg rounded-2xl sm:rounded-[2rem] shadow-2xl border border-medical-border/60 relative">
      {workflowStep === 'landing' && !user && (
        <main className="flex-1 flex flex-col items-center p-6 bg-medical-bg overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center w-full max-w-5xl mx-auto flex flex-col items-center gap-12 p-12 py-16"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="mb-6 transform hover:scale-105 transition-transform duration-500 will-change-transform relative group">
                <MedilogueLogo className="w-40 h-40 drop-shadow-2xl" />
              </div>
              <h1 className="text-6xl font-serif font-bold text-medical-dark tracking-tight leading-tight">
                MEDILOGUE <br/>
                <span className="text-[20px] font-sans font-medium uppercase tracking-[0.3em] text-medical-accent mt-4 block">Connecting Care Through AI</span>
              </h1>
              <p className="text-xl text-medical-secondary max-w-xl font-medium mt-4 leading-relaxed">
                全方位跨專業協作 (IPE) 數位人文教學平台，透過 AI 擬真情境對話，磨練您的醫病溝通與團隊合作。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
              {[
                { icon: <MessageSquare />, title: '擬真對話', desc: '與具備獨特性格的 AI 患者進行深度溝通。' },
                { icon: <Users />, title: 'IPE 協作', desc: '模擬跨專業團隊共同照護與決策過程。' },
                { icon: <LineChart />, title: '人文分析', desc: 'AI 導師即時給予共情與倫理面的深度回饋。' }
              ].map((feature, i) => (
                <div key={i} className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl border border-medical-border text-center flex flex-col items-center gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className="text-medical-primary mb-2">{feature.icon}</div>
                  <h3 className="font-bold text-sm text-medical-dark uppercase tracking-wide">{feature.title}</h3>
                  <p className="text-[10px] text-medical-secondary leading-relaxed opacity-80">{feature.desc}</p>
                </div>
              ))}
            </div>

            <div className="max-w-3xl w-full bg-white/40 backdrop-blur-md rounded-[2.5rem] p-10 border border-white/50 shadow-inner text-left space-y-6">
                <h3 className="text-sm font-bold text-medical-primary uppercase tracking-[0.2em] flex items-center gap-2">
                  <Zap size={16} /> AI 技術關鍵特點
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-medical-dark">Gemini 核心驅動</h4>
                    <p className="text-[10px] text-medical-secondary leading-relaxed">搭載 Google Gemini 頂尖語言模型，能精準捕捉醫療情境中的情感細節與非語文暗示，產出高度擬真的臨床反應。</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-medical-dark">動態情境引擎</h4>
                    <p className="text-[10px] text-medical-secondary leading-relaxed">AI 個案會根據學習者的共情表現、文化敏感度與專業態度，動態調整其疼痛指數與情緒狀態，創造具挑戰性的教學閉環。</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-medical-dark">即時導師提示</h4>
                    <p className="text-[10px] text-medical-secondary leading-relaxed">內建 AI 導師系統，全程監測對話邏輯。當出現醫療倫理風險或溝通斷點時，將即時發出臨床、倫理或警示性提示。</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-medical-dark">多維度敘事評估</h4>
                    <p className="text-[10px] text-medical-secondary leading-relaxed">練習結束後，AI 會針對專業知識、共情展現、溝通結構等多重維度進行深度分析，並以視覺化雷達圖呈現學習成長路徑。</p>
                  </div>
                </div>
            </div>

            <button 
              onClick={signInWithGoogle}
              className="mt-4 px-12 py-5 bg-medical-primary text-white rounded-full font-bold text-lg tracking-widest uppercase shadow-2xl hover:bg-medical-dark transition-all transform hover:scale-105 flex items-center gap-4"
            >
              <Zap size={20} /> 開啟 AI 擬真培訓 
            </button>

            <div className="mt-12 flex flex-col items-center gap-4 opacity-50">
               <div className="h-px w-20 bg-medical-border"></div>
               <p className="text-[10px] uppercase tracking-[0.3em] font-bold">National Taiwan University</p>
            </div>
          </motion.div>

        </main>
      )}

      {workflowStep === 'landing' && user && (
        <main className="flex-1 flex flex-col items-center p-6 bg-medical-bg overflow-y-auto">
          <motion.div 
             initial={{ opacity: 0, scale: 0.9 }}
             animate={{ opacity: 1, scale: 1 }}
             className="text-center space-y-12 max-w-4xl w-full py-12"
          >
            <div className="space-y-4">
              <h2 className="text-4xl font-serif font-bold text-medical-dark">您好，今天想如何練習？</h2>
              <p className="text-medical-secondary font-medium">選擇模擬情境以開始練習，系統將根據您的互動即時提供引導、評估與回饋。</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <button 
                onClick={() => { setActiveTab('Simulation'); setWorkflowStep('setupPatient'); }}
                className="group p-8 bg-white rounded-[2.5rem] border-2 border-transparent hover:border-medical-primary shadow-lg hover:shadow-xl transition-all flex flex-col items-center text-center gap-4"
              >
                <div className="w-16 h-16 bg-medical-soft rounded-2xl flex items-center justify-center text-medical-primary group-hover:scale-110 transition-transform">
                  <Brain size={32} />
                </div>
                <h3 className="text-xl font-bold text-medical-dark">擬真診間模擬</h3>
                <p className="text-xs text-medical-secondary leading-relaxed">單獨與 AI 患者面談，磨練臨床敘事、病史詢問與醫病溝通技巧。</p>
                <div className="mt-4 px-6 py-2 bg-medical-primary text-white rounded-full text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  點擊進入
                </div>
              </button>

              <button 
                onClick={() => { setActiveTab('Ward'); setWorkflowStep('setupPatient'); }}
                className="group p-8 bg-white rounded-[2.5rem] border-2 border-transparent hover:border-medical-primary shadow-lg hover:shadow-xl transition-all flex flex-col items-center text-center gap-4"
              >
                <div className="w-16 h-16 bg-medical-soft rounded-2xl flex items-center justify-center text-medical-primary group-hover:scale-110 transition-transform">
                  <Users size={32} />
                </div>
                <h3 className="text-xl font-bold text-medical-dark">團隊討論模擬</h3>
                <p className="text-xs text-medical-secondary leading-relaxed">模擬 IPE 跨專業團隊會議，針對複雜個案進行多專業合作決策。</p>
                <div className="mt-4 px-6 py-2 bg-medical-primary text-white rounded-full text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  點擊進入
                </div>
              </button>

              <button 
                onClick={() => { setActiveTab('History'); setWorkflowStep('simulation'); }}
                className="group p-8 bg-white rounded-[2.5rem] border-2 border-transparent hover:border-medical-primary shadow-lg hover:shadow-xl transition-all flex flex-col items-center text-center gap-4"
              >
                <div className="w-16 h-16 bg-medical-soft rounded-2xl flex items-center justify-center text-medical-primary group-hover:scale-110 transition-transform">
                  <Clock size={32} />
                </div>
                <h3 className="text-xl font-bold text-medical-dark">歷史紀錄查詢</h3>
                <p className="text-xs text-medical-secondary leading-relaxed">回顧過往的練習對話、AI 人文評估報告與您的敘事反思筆記。</p>
                <div className="mt-4 px-6 py-2 bg-medical-primary text-white rounded-full text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  前往回顧
                </div>
              </button>

              <button 
                onClick={() => { setActiveTab('ManualReview'); setWorkflowStep('simulation'); }}
                className="group p-8 bg-white rounded-[2.5rem] border-2 border-transparent hover:border-medical-primary shadow-lg hover:shadow-xl transition-all flex flex-col items-center text-center gap-4"
              >
                <div className="w-16 h-16 bg-medical-soft rounded-2xl flex items-center justify-center text-medical-primary group-hover:scale-110 transition-transform">
                  <FileText size={32} />
                </div>
                <h3 className="text-xl font-bold text-medical-dark">人工查核</h3>
                <p className="text-xs text-medical-secondary leading-relaxed">審核系統紀錄與反饋，針對練習歷程提供人工查核與介入指導。</p>
                <div className="mt-4 px-6 py-2 bg-medical-primary text-white rounded-full text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  進入查核
                </div>
              </button>
            </div>
          </motion.div>
        </main>
      )}

      {workflowStep === 'setupPatient' && (
        <CaseSelection
          onSelectCase={(patient, learnMode, stressMode) => {
            setSelectedPatient(patient);
            setIsLearningMode(learnMode);
            setIsStressTestMode(stressMode);
            if (activeTab === 'Ward') {
              setWorkflowStep('setupRole');
            } else {
              setWorkflowStep('simulation');
              resetSim(patient);
            }
          }}
          onBackToHome={() => setWorkflowStep('landing')}
          initialSelectedPatientId={selectedPatient?.id}
          activeTabType={activeTab === 'Ward' ? 'Ward' : 'Simulation'}
        />
      )}

      {workflowStep === 'setupRole' && user && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 bg-medical-bg">
          <div className="w-full max-w-6xl space-y-8">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setWorkflowStep('setupPatient')}
                className="flex items-center gap-2 text-medical-secondary hover:text-medical-primary font-bold uppercase text-[10px] tracking-widest transition-colors"
              >
                <ChevronLeft size={16} /> 返回選擇個案
              </button>
              <div className="text-right">
                <h2 className="text-3xl font-serif font-bold text-medical-dark">您在團隊中的角色？</h2>
                <p className="text-medical-secondary text-sm">選擇後系統將根據您的專業身分調整模擬對話內容。</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { id: 'Doctor' as Role, title: '醫師', icon: <Stethoscope />, color: 'bg-blue-50 text-blue-600', desc: '負責臨床診斷與最終決策處置方案。' },
                { id: 'Nurse' as Role, title: '護理師', icon: <Activity />, color: 'bg-emerald-50 text-emerald-600', desc: '關注生命徵象變化與第一線臨床照護執行。' },
                { id: 'SocialWorker' as Role, title: '社工師', icon: <HeartPulse />, color: 'bg-amber-50 text-amber-600', desc: '評估社會資源連結與家屬支持系統狀況。' },
                { id: 'Psychologist' as Role, title: '心理師', icon: <Brain />, color: 'bg-purple-50 text-purple-600', desc: '分析患者心理防衛機制與情緒共感需求。' }
              ].map((role) => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className={`group relative p-8 rounded-[2.5rem] border-2 transition-all text-center flex flex-col items-center gap-6 ${
                    selectedRole === role.id 
                      ? 'border-medical-primary bg-white shadow-xl' 
                      : 'border-transparent bg-white/40 hover:bg-white/70 shadow-sm'
                  }`}
                >
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-transform group-hover:scale-110 ${role.color}`}>
                    {role.icon}
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-bold text-medical-dark">{role.title}</h3>
                    <p className="text-[10px] text-medical-secondary leading-relaxed mt-3 opacity-80">
                      {role.desc}
                    </p>
                  </div>

                  <div className={`mt-4 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    selectedRole === role.id ? 'bg-medical-primary text-white scale-100' : 'bg-medical-soft text-medical-primary scale-0'
                  }`}>
                    <Zap size={16} fill="currentColor" />
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-center mt-8">
              <button 
                onClick={() => { setWorkflowStep('simulation'); resetSim(); }}
                className="px-16 py-6 bg-medical-primary text-white rounded-full font-bold text-sm tracking-widest uppercase shadow-2xl hover:bg-medical-dark transition-all transform hover:scale-105 flex items-center gap-4"
              >
                確認身分，開始團隊討論 <Zap size={20} />
              </button>
            </div>
          </div>
        </main>
      )}

      {workflowStep === 'simulation' && user && (
        <>
              <header className="h-16 glass-panel border-b border-medical-border sticky top-0 z-50 flex items-center justify-between px-8">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  resetSim();
                  setWorkflowStep('landing');
                }}
                className="w-12 h-12 flex items-center justify-center shadow-sm hover:scale-105 transition-all outline-none"
              >
                <MedilogueLogo className="w-10 h-10" />
              </button>
              <div>
                <h1 className="font-serif text-xl font-semibold tracking-tight text-medical-dark">MEDILOGUE</h1>
                <p className="text-[9px] uppercase tracking-[0.2em] text-medical-primary font-bold opacity-70">Humanizing Healthcare Communication</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1 bg-medical-soft p-1 rounded-full">
              <button
                onClick={() => {
                  resetSim();
                  setWorkflowStep('landing');
                }}
                className="px-5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all text-medical-primary/60 hover:text-medical-primary"
              >
                首頁
              </button>
              {(['Simulation', 'Ward', 'Reflections', 'History', 'ManualReview'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all ${
                    activeTab === tab 
                      ? 'bg-white text-medical-primary shadow-sm' 
                      : 'text-medical-primary/60 hover:text-medical-primary'
                  }`}
                >
                  {tab === 'Simulation' && '擬真診間'}
                  {tab === 'Ward' && '團隊協作'}
                  {tab === 'Reflections' && '敘事反思'}
                  {tab === 'History' && '實踐紀錄'}
                  {tab === 'ManualReview' && '人工查核'}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-6">
              {isLearningMode && activeTab === 'Simulation' && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 text-[9px] rounded-full font-bold uppercase tracking-widest border border-amber-200">
                  <Brain size={10} /> 學習模式
                </div>
              )}
              {isStressTestMode && activeTab === 'Simulation' && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 text-[9px] rounded-full font-bold uppercase tracking-widest border border-red-200">
                  <Flame size={10} /> 壓力測試中
                </div>
              )}
              <button 
                onClick={() => {
                  resetSim();
                  setWorkflowStep('setupPatient');
                }}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-medical-border rounded-full hover:bg-medical-soft transition-all"
              >
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-bold text-medical-secondary">切換情境</span>
              </button>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-medical-dark">使用者</span>
                  <button onClick={() => signOut(auth)} className="text-[9px] text-medical-accent font-bold uppercase tracking-widest hover:underline">登出</button>
                </div>
                <div className="w-8 h-8 rounded-full bg-medical-soft flex items-center justify-center text-medical-primary shadow-sm"><UserCircle size={20} /></div>
              </div>
              <button className="md:hidden text-medical-primary"><Menu /></button>
            </div>
          </header>

          <main className="flex-1 flex overflow-hidden p-6 gap-6">
            {activeTab !== 'History' && activeTab !== 'Reflections' && (
            <aside className="w-64 flex flex-col gap-4 overflow-y-auto pr-2 shrink-0">
               {/* User Role Card */}
               <div className="bg-white rounded-xl p-3 shadow-sm border border-medical-border text-center shrink-0">
                  <div className="w-8 h-8 bg-medical-soft rounded-lg flex items-center justify-center text-medical-primary mx-auto mb-2 shadow-inner">
                    {selectedRole === 'Doctor' && <Users size={16} />}
                    {selectedRole === 'Nurse' && <Heart size={16} />}
                    {selectedRole === 'SocialWorker' && <Brain size={16} />}
                    {selectedRole === 'Psychologist' && <Zap size={16} />}
                  </div>
                  <h4 className="text-[10px] font-bold uppercase text-medical-primary tracking-widest mb-1">正在模擬</h4>
                  <div className="text-[14px] font-bold text-medical-dark">
                     {selectedRole === 'Doctor' ? '臨床醫師' : selectedRole === 'Nurse' ? '護理師' : selectedRole === 'SocialWorker' ? '社工師' : '心理師'}
                  </div>
               </div>

               {/* Patient Profile Card */}
               <div className="bg-white rounded-xl p-3 shadow-sm border border-medical-border text-center shrink-0">
                  <div className="text-3xl mb-1 drop-shadow-sm">{selectedPatient.avatar}</div>
                  <h4 className="text-[10px] font-bold uppercase text-medical-primary tracking-widest mb-1">對應個案</h4>
                  <div className="text-[14px] font-bold text-medical-dark">{selectedPatient.name}</div>
                  <button 
                    onClick={() => setWorkflowStep('setupPatient')}
                    className="mt-2 text-[10px] font-bold text-medical-accent uppercase tracking-widest hover:underline"
                  >
                    更換練習個案
                  </button>
               </div>

               {/* Medical Summary Card (Moved from Clinic Header) */}
               {selectedPatient.id !== 'random' && (
                 <div className="bg-[#F8FAF8] rounded-xl p-3 shadow-sm border border-medical-border border-l-4 border-l-medical-primary shrink-0 text-left">
                   <h4 className="text-[10px] font-bold uppercase text-medical-primary tracking-widest mb-1.5 flex items-center gap-1">
                     <Heart size={12} /> 醫療摘要
                   </h4>
                   <div className="text-[12px] leading-relaxed text-medical-dark font-medium">
                     {selectedPatient.medicalSummary}
                   </div>
                 </div>
               )}

               {/* Clinical Artifacts Section */}
               {selectedPatient.artifacts && selectedPatient.artifacts.length > 0 && (
                 <div className="bg-white rounded-2xl p-4 shadow-sm border border-medical-border shrink-0 text-left">
                   <h4 className="text-[9px] font-bold uppercase text-medical-primary tracking-widest mb-3 flex items-center gap-1">
                     <BookOpen size={10} /> 相關檢驗與影像
                   </h4>
                   <div className="flex flex-col gap-2">
                     {selectedPatient.artifacts.map((artifact) => (
                       <button
                         key={artifact.id}
                         onClick={() => setSelectedArtifact(artifact)}
                         className="flex items-center gap-3 p-3 rounded-xl border border-medical-border hover:border-medical-primary hover:bg-medical-soft text-left transition-all group"
                       >
                         <div className="w-8 h-8 rounded-lg bg-medical-soft flex items-center justify-center text-medical-primary shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                           {artifact.type === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />}
                         </div>
                         <div className="min-w-0">
                           <div className="text-[10px] font-bold text-medical-dark truncate group-hover:text-medical-primary transition-colors">{artifact.title}</div>
                           <div className="text-[8px] text-medical-secondary truncate">{artifact.description}</div>
                         </div>
                       </button>
                     ))}
                   </div>
                 </div>
               )}

               <div className="mt-auto flex flex-col gap-4">
                 {/* Timer Display */}
                 {!analysis && !showAnalysis && (
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-medical-border flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2 text-medical-primary font-bold text-[9px] uppercase tracking-widest">
                        <Clock size={12} /> 練習時間
                      </div>
                      <div className="text-xs font-mono font-bold text-medical-dark">
                        {formatTime(sessionTimer)}
                      </div>
                    </div>
                 )}

                 {/* Status & Control Section */}
                 <div className="flex flex-col gap-4">
                    {/* Pain/Emotion Meter */}
                    {painLevel !== null && (activeTab === 'Simulation' || activeTab === 'Ward') && !analysis && !showAnalysis && (
                      <div className="bg-white rounded-2xl p-4 border border-medical-border shadow-sm flex flex-col gap-3 shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-medical-accent font-bold text-[9px] uppercase tracking-widest shrink-0">
                            <Activity size={14} className={painLevel > 80 ? "animate-pulse" : ""} />
                            <div className="group relative flex items-center gap-1 cursor-help">
                              {selectedPatient.id === 'p10' ? '家屬情緒壓力' : '患者疼痛指數'}
                              <Info size={10} className="text-medical-primary opacity-50" />
                              <div className="absolute left-0 bottom-6 hidden group-hover:block w-48 p-3 bg-medical-dark text-white text-[9px] rounded-xl z-30 shadow-xl leading-relaxed font-normal ring-1 ring-white/10 text-left">
                                💡 狀態說明：此指標反映{selectedPatient.id === 'p10' ? '家屬的精神壓力與情緒波動' : '患者的生理與精神壓力'}。適時展現專業關懷及資源協調，將有助於穩定指標。
                              </div>
                            </div>
                          </div>
                          <div className={`text-[10px] font-bold shrink-0 ${painLevel > 80 ? 'text-medical-accent' : 'text-medical-secondary'}`}>
                            {painLevel >= 100 ? (selectedPatient.id === 'p10' ? '情緒崩潰' : '已失去意識') : `${painLevel}%`}
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-medical-soft rounded-full overflow-hidden border border-medical-border">
                          <motion.div 
                            className={`h-full ${painLevel > 80 ? 'bg-medical-accent' : painLevel > 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${painLevel}%` }}
                            transition={{ type: 'spring', stiffness: 50 }}
                          />
                        </div>
                      </div>
                    )}

                   {/* End Session Button */}
                   {!analysis && !showAnalysis && (
                     <button 
                       onClick={handleEndSession}
                       disabled={isAnalyzing}
                       className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-medical-accent text-white rounded-full text-[10px] font-bold hover:bg-medical-accent/90 transition-all shadow-md hover:scale-[1.02] active:scale-95 disabled:opacity-50 shrink-0"
                     >
                       {isAnalyzing ? <RotateCcw className="animate-spin" size={14} /> : <Zap size={14} />} 
                       {activeTab === 'Simulation' ? '結束個案面談' : '結束團隊會議'}
                     </button>
                   )}
                 </div>
               </div>
            </aside>
            )}

        <section className="flex-1 relative flex flex-col bg-white rounded-[2rem] shadow-lg border border-medical-border overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'Simulation' && (
              <motion.div key="simulation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-4 min-h-0">
                <div className="flex justify-between items-start mb-2 border-b border-medical-soft pb-2">
                  <div className="flex gap-3 items-center">
                    <div className="w-12 h-12 rounded-full bg-medical-soft flex items-center justify-center border-[2px] border-white shadow-inner overflow-hidden text-2xl">
                      {selectedPatient.avatar}
                    </div>
                    <div>
                      <h2 className="text-[20px] font-serif font-medium text-medical-dark leading-tight mb-0.5">
                        {selectedPatient.name}, {selectedPatient.id === 'random' ? '???' : selectedPatient.age} 歲
                      </h2>
                      <div className="text-[14px] text-medical-secondary max-w-md">
                        {selectedPatient.id === 'random' ? (
                          '請透過病史詢問了解患者主訴。'
                        ) : (
                          <p className="line-clamp-2">{selectedPatient.chiefComplaint}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setAutoTTS(!autoTTS)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${autoTTS ? 'bg-medical-primary text-white shadow-md' : 'bg-white text-medical-secondary border border-medical-border hover:border-medical-primary/50'}`}
                  >
                    {autoTTS ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    <span className="mt-0.5">語音同步朗讀</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                  {chatHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                      <div className="w-16 h-16 bg-medical-soft rounded-full flex items-center justify-center text-medical-primary">
                        <Brain size={32} />
                      </div>
                      <h3 className="text-lg font-serif font-medium text-medical-dark">建立溝通橋樑</h3>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {['「您好，我是今天的值班醫師...」', '「最近感覺如何？」'].map((hint) => (
                          <button key={hint} onClick={() => setInputText(hint)} className="px-3 py-1.5 bg-medical-soft border border-medical-border rounded-lg text-[10px] text-medical-primary font-bold hover:bg-white transition-all">
                            {hint}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-4 text-sm leading-relaxed relative group ${msg.role === 'user' ? 'bg-medical-primary text-white rounded-2xl rounded-br-none shadow-sm max-w-[85%]' : 'bg-medical-soft text-medical-dark rounded-2xl rounded-tl-none max-w-[85%]'}`}>
                        <div className="flex justify-between items-center mb-1">
                           <div className="text-[10px] font-bold opacity-60">{msg.roleName}</div>
                           {msg.role !== 'user' && !msg.isHint && (
                             <button
                               onClick={() => handleSpeak(msg.text, selectedPatient)}
                               className="text-medical-primary/40 hover:text-medical-primary transition-colors focus:outline-none opacity-0 group-hover:opacity-100"
                               title="朗讀此訊息"
                             >
                                <Volume2 size={14} />
                             </button>
                           )}
                        </div>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {latestEvaluation && activeTab === 'Simulation' && (
                    <div className="mt-8 p-6 bg-white border-2 border-medical-primary/20 rounded-[2rem] shadow-xl overflow-hidden">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-sm font-bold text-medical-primary uppercase tracking-widest flex items-center gap-2">
                          <Award size={16} /> 模擬對話評估摘要
                        </h4>
                        <div className="flex justify-end items-center gap-3">
                          {!soapNote && (
                            <button 
                              onClick={handleGenerateSoapNote}
                              disabled={isGeneratingSoap}
                              className="flex items-center gap-1.5 px-4 py-2 bg-orange-100/80 text-orange-800 rounded-full text-[10px] font-bold hover:bg-orange-200 transition-all font-medium border border-orange-200"
                            >
                              <FileText size={12} /> {isGeneratingSoap ? '生成中...' : '生成 SOAP Note'}
                            </button>
                          )}
                          <button 
                            onClick={() => exportReport(chatHistory, latestEvaluation)}
                            className="flex items-center gap-2 px-4 py-2 bg-medical-soft text-medical-primary rounded-full text-[10px] font-bold hover:bg-medical-primary hover:text-white transition-all"
                          >
                            <Download size={12} /> 匯出完整報告
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                         <div className="h-[250px] bg-medical-soft/20 rounded-2xl flex items-center justify-center p-2 md:col-span-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                <PolarGrid />
                                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                                <Tooltip wrapperStyle={{ fontSize: '10px', outline: 'none' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Radar name="評分" dataKey="A" stroke="#4A5D4A" fill="#4A5D4A" fillOpacity={0.6} />
                              </RadarChart>
                            </ResponsiveContainer>
                         </div>
                         <div className="space-y-4 md:col-span-2">
                            <div className="p-3 bg-medical-soft rounded-2xl">
                               <div className="text-[10px] font-bold opacity-50 uppercase mb-1">專家評等</div>
                               <div className="text-xl font-serif font-bold text-medical-primary italic">
                                  {latestEvaluation.empathyLevel === 'Great' ? '卓越表現' : 
                                   latestEvaluation.empathyLevel === 'High' ? '專業優異' : 
                                   latestEvaluation.empathyLevel === 'Medium' ? '表現穩定' : '尚有進步空間'}
                               </div>
                            </div>
                            <div>
                               <div className="text-[10px] font-bold opacity-50 uppercase mb-2">溝通優點</div>
                               <ul className="space-y-1">
                                  {(latestEvaluation.strengths || []).slice(0, 2).map((item: string, i: number) => (
                                    <li key={i} className="text-[12px] text-green-700 leading-relaxed flex gap-1 font-medium">• {item}</li>
                                  ))}
                                </ul>
                            </div>
                            <div>
                               <div className="text-[10px] font-bold opacity-50 uppercase mb-2">待改進點</div>
                               <ul className="space-y-1">
                                  {(latestEvaluation.weaknesses || []).slice(0, 1).map((item: string, i: number) => (
                                    <li key={i} className="text-[12px] text-red-700 leading-relaxed flex gap-1 font-medium">• {item}</li>
                                  ))}
                                </ul>
                            </div>
                            {latestEvaluation.patientVoice && (
                              <div className="col-span-2 mt-2 pt-3 border-t border-medical-border">
                                <div className="text-[10px] font-bold text-blue-700 uppercase mb-1">病患心聲</div>
                                <div className="text-[12px] text-blue-900 italic leading-snug">"{latestEvaluation.patientVoice}"</div>
                              </div>
                            )}
                         </div>
                      </div>
                      
                      {/* SOAP Note Actions & Output added after interview completion */}
                      <div className="mt-6 flex flex-col gap-3">
                         {soapNote && (
                           <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                             <div className="flex justify-between items-center mb-2">
                               <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-800 flex items-center gap-2">
                                 <FileText size={14} /> AI Scribing (SOAP Note)
                               </h3>
                               <button 
                                 onClick={() => exportSoapNote(soapNote, selectedPatient.name)}
                                 className="flex items-center gap-1.5 px-3 py-1 bg-white text-orange-700 border border-orange-200 rounded-full text-[9px] font-bold hover:bg-orange-100 transition-all shadow-sm"
                               >
                                 <Download size={10} /> 匯出
                               </button>
                             </div>
                             <div className="text-[12px] text-gray-700 leading-relaxed font-mono bg-white p-4 rounded-xl border border-orange-100 whitespace-pre-wrap">
                               {soapNote}
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  )}
                  {isTyping && <div className="animate-pulse text-[10px] text-medical-secondary font-bold p-4">患者正在思考中...</div>}
                  <div ref={chatEndRef} />
                </div>

                <div className="mt-8 pt-6 border-t border-medical-soft flex flex-col gap-3">
                  {speechError && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-medical-accent font-bold bg-[#FDF2F0] px-4 py-2 rounded-lg flex justify-between items-center"
                    >
                      <span>{speechError}</span>
                      <div className="flex items-center gap-2">
                        {speechError.includes('分頁') && (
                          <button 
                            onClick={() => window.open(window.location.href, '_blank')}
                            className="bg-medical-accent text-white px-2 py-0.5 rounded text-[8px] uppercase tracking-tighter hover:bg-medical-accent/90"
                          >
                            在新分頁開啟
                          </button>
                        )}
                        <button onClick={() => setSpeechError(null)} className="opacity-50 hover:opacity-100">✕</button>
                      </div>
                    </motion.div>
                  )}
                  <div className="flex items-center gap-4">
                    {isLearningMode && (
                      <button 
                        onClick={handleGetHint}
                        disabled={isGettingHint || isTyping}
                        className={`p-4 rounded-full shadow-md transition-all flex items-center justify-center ${isGettingHint ? 'bg-amber-100 text-amber-500' : 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-200'}`}
                        title="獲取溝通提示"
                      >
                         <Brain size={20} />
                      </button>
                    )}
                    <button 
                      onClick={() => startSpeechRecognition('simulation')}
                      className={`p-4 rounded-full shadow-md transition-all ${isRecording ? 'bg-medical-accent text-white animate-pulse' : 'bg-white text-medical-primary hover:bg-medical-soft'}`}
                    >
                      {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    <textarea 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      rows={1}
                      placeholder={painLevel !== null && painLevel >= 100 ? "患者已失去意識，無法進一步對話..." : (isRecording ? "正在聆聽您的專業對話..." : "輸入對話 (Ctrl+Enter 送出)...")}
                      disabled={isTyping || (painLevel !== null && painLevel >= 100)}
                      className={`w-full bg-medical-bg border border-medical-border rounded-2xl py-3 px-6 text-sm focus:outline-none resize-none ${(painLevel !== null && painLevel >= 100) ? 'opacity-50 grayscale' : ''}`}
                    />
                    <button onClick={handleSendMessage} disabled={!inputText.trim() || isTyping || (painLevel !== null && painLevel >= 100)} className="bg-medical-primary text-white p-4 rounded-full shadow-md hover:bg-medical-dark disabled:opacity-50">
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Ward' && (
              <motion.div key="ward" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-4 min-h-0">
                <div className="flex justify-between items-start mb-2 border-b border-medical-soft pb-2">
                  <div>
                    <h2 className="text-[20px] font-serif font-medium text-medical-dark mb-0.5">團隊協作模擬 (IPE Mode)</h2>
                    <p className="text-[14px] text-medical-secondary">由 AI 扮演其他團隊角色，模擬查房與跨領域溝通。</p>
                  </div>
                  <button 
                    onClick={() => setAutoTTS(!autoTTS)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${autoTTS ? 'bg-medical-primary text-white shadow-md' : 'bg-white text-medical-secondary border border-medical-border hover:border-medical-primary/50'}`}
                  >
                    {autoTTS ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    <span className="mt-0.5">語音同步朗讀</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
                  {wardHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12">
                      <div className="w-16 h-16 bg-medical-soft rounded-full flex items-center justify-center text-medical-primary mb-4">
                        <Users size={32} />
                      </div>
                      <p className="text-xs text-medical-secondary">請以您選定的角色開啟團隊討論...</p>
                    </div>
                  )}
                  {wardHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-4 text-sm leading-relaxed relative group ${msg.role === 'user' ? 'bg-medical-primary text-white rounded-2xl rounded-br-none max-w-[85%]' : 'bg-stone-100 text-medical-dark rounded-2xl rounded-tl-none max-w-[85%]'}`}>
                        <div className="flex justify-between items-center mb-1">
                           <div className="text-[10px] font-bold opacity-60">{msg.roleName}</div>
                           {msg.role !== 'user' && !msg.isHint && (
                             <button
                               onClick={() => handleSpeak(msg.text, { name: msg.roleName, age: 30, avatar: '👨‍⚕️' })}
                               className="text-medical-primary/40 hover:text-medical-primary transition-colors focus:outline-none opacity-0 group-hover:opacity-100"
                               title="朗讀此訊息"
                             >
                                <Volume2 size={14} />
                             </button>
                           )}
                        </div>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {latestEvaluation && activeTab === 'Ward' && (
                    <div className="mt-8 p-6 bg-white border-2 border-medical-primary/20 rounded-[2rem] shadow-xl overflow-hidden">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-sm font-bold text-medical-primary uppercase tracking-widest flex items-center gap-2">
                          <Users size={16} /> 團隊協作評估摘要
                        </h4>
                        <div className="flex items-center gap-2">
                          {!soapNote && (
                            <button 
                              onClick={handleGenerateSoapNote}
                              disabled={isGeneratingSoap}
                              className="flex items-center gap-1.5 px-4 py-2 bg-orange-100/80 text-orange-800 rounded-full text-[10px] font-bold hover:bg-orange-200 transition-all font-medium border border-orange-200 shrink-0"
                            >
                              <FileText size={12} /> {isGeneratingSoap ? '生成中...' : '生成 SOAP Note'}
                            </button>
                          )}
                          <button 
                            onClick={() => handleRequestHumanReview(sessionId)}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold hover:bg-amber-100 transition-all border border-amber-200"
                          >
                            <UserCircle size={12} /> 申請人工覆核
                          </button>
                          <button 
                            onClick={() => exportReport(wardHistory, latestEvaluation)}
                            className="flex items-center gap-2 px-4 py-2 bg-medical-soft text-medical-primary rounded-full text-[10px] font-bold hover:bg-medical-primary hover:text-white transition-all"
                          >
                            <Download size={12} /> 匯出完整報告
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                         <div className="h-[250px] bg-medical-soft/20 rounded-2xl flex items-center justify-center p-2 md:col-span-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                <PolarGrid stroke="#E2E8CE" />
                                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                                <Tooltip wrapperStyle={{ fontSize: '10px', outline: 'none' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Radar name="評分" dataKey="A" stroke="#4A5D4A" fill="#4A5D4A" fillOpacity={0.6} />
                              </RadarChart>
                            </ResponsiveContainer>
                         </div>
                         <div className="space-y-4 md:col-span-2">
                            <div className="p-3 bg-medical-soft rounded-2xl">
                               <div className="text-[10px] font-bold opacity-50 uppercase mb-1">團隊表現評等</div>
                               <div className="text-xl font-serif font-bold text-medical-primary italic">
                                  {latestEvaluation.empathyLevel === 'Great' ? '卓越表現' : 
                                   latestEvaluation.empathyLevel === 'High' ? '專業優異' : 
                                   latestEvaluation.empathyLevel === 'Medium' ? '表現穩定' : '尚有進步空間'}
                               </div>
                            </div>
                            <div>
                               <div className="text-[10px] font-bold opacity-50 uppercase mb-2">協作優點</div>
                               <ul className="space-y-1">
                                  {(latestEvaluation.strengths || []).slice(0, 2).map((item: string, i: number) => (
                                    <li key={i} className="text-[12px] text-green-700 leading-relaxed flex gap-1 font-medium">• {item}</li>
                                  ))}
                                </ul>
                            </div>
                            <div>
                               <div className="text-[10px] font-bold opacity-50 uppercase mb-2">協作挑戰</div>
                               <ul className="space-y-1">
                                  {(latestEvaluation.weaknesses || []).slice(0, 1).map((item: string, i: number) => (
                                    <li key={i} className="text-[12px] text-red-700 leading-relaxed flex gap-1 font-medium">• {item}</li>
                                  ))}
                                </ul>
                            </div>
                            {latestEvaluation.patientVoice && (
                              <div className="col-span-2 mt-2 pt-3 border-t border-medical-border">
                                <div className="text-[10px] font-bold text-blue-700 uppercase mb-1">病患心聲</div>
                                <div className="text-[12px] text-blue-900 italic leading-snug">"{latestEvaluation.patientVoice}"</div>
                              </div>
                            )}
                         </div>
                      </div>

                      {/* SOAP Note Actions & Output added after interview completion */}
                      <div className="mt-6 flex flex-col gap-3">
                         {soapNote && (
                           <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                             <div className="flex justify-between items-center mb-2">
                               <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-800 flex items-center gap-2">
                                 <FileText size={14} /> AI Scribing (SOAP Note)
                               </h3>
                               <button 
                                 onClick={() => exportSoapNote(soapNote, selectedPatient.name)}
                                 className="flex items-center gap-1.5 px-3 py-1 bg-white text-orange-700 border border-orange-200 rounded-full text-[9px] font-bold hover:bg-orange-100 transition-all shadow-sm"
                               >
                                 <Download size={10} /> 匯出
                               </button>
                             </div>
                             <div className="text-[12px] text-gray-700 leading-relaxed font-mono bg-white p-4 rounded-xl border border-orange-100 whitespace-pre-wrap">
                               {soapNote}
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  )}
                  {isTyping && <div className="animate-pulse text-[10px] text-medical-secondary font-bold">團隊成員討論中...</div>}
                  <div ref={wardEndRef} />
                </div>

                <div className="mt-8 pt-6 border-t border-medical-soft flex flex-col gap-3">
                  {speechError && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-medical-accent font-bold bg-[#FDF2F0] px-4 py-2 rounded-lg flex justify-between items-center"
                    >
                      <span>{speechError}</span>
                      <div className="flex items-center gap-2">
                        {speechError.includes('分頁') && (
                          <button 
                            onClick={() => window.open(window.location.href, '_blank')}
                            className="bg-medical-accent text-white px-2 py-0.5 rounded text-[8px] uppercase tracking-tighter hover:bg-medical-accent/90"
                          >
                            在新分頁開啟
                          </button>
                        )}
                        <button onClick={() => setSpeechError(null)} className="opacity-50 hover:opacity-100">✕</button>
                      </div>
                    </motion.div>
                  )}
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => startSpeechRecognition('ward')}
                      className={`p-4 rounded-full shadow-md transition-all ${isWardRecording ? 'bg-medical-accent text-white animate-pulse' : 'bg-white text-medical-primary hover:bg-medical-soft'}`}
                    >
                      {isWardRecording ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    <textarea 
                      value={wardInput}
                      onChange={(e) => setWardInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          e.preventDefault();
                          handleWardMessage();
                        }
                      }}
                      rows={1}
                      placeholder={painLevel !== null && painLevel >= 100 ? "患者已失去意識，請立即與團隊協作進行急救..." : (isWardRecording ? "對話錄音中..." : "向團隊提出見解 (Ctrl+Enter 送出)...")}
                      className={`w-full bg-medical-bg border border-medical-border rounded-2xl py-3 px-6 text-sm focus:outline-none resize-none ${painLevel !== null && painLevel >= 100 ? 'opacity-50 grayscale' : ''}`}
                      disabled={isTyping}
                    />
                    <button onClick={handleWardMessage} disabled={!wardInput.trim() || isTyping} className="bg-medical-primary text-white p-4 rounded-full">
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Analysis' && (
              <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 p-10 overflow-y-auto">
                <div className="max-w-4xl mx-auto flex flex-col gap-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-serif font-medium text-medical-dark tracking-tight">人文共情指標數據</h2>
                      <p className="text-xs font-bold uppercase tracking-widest text-medical-primary mt-2">AI 人文導師深度分析報告</p>
                    </div>
                    <div className="flex gap-4">
                      {analysis && (
                        <button 
                          onClick={() => handleRequestHumanReview(sessionId)}
                          className="px-6 py-4 bg-amber-600 text-white rounded-full text-xs font-bold uppercase tracking-widest shadow-xl flex items-center gap-2 hover:bg-amber-700 transition-all"
                        >
                          <UserCircle size={18} /> 申請老師覆核
                        </button>
                      )}
                      {!analysis && !showAnalysis && (
                        <button onClick={handleAnalysis} className="px-8 py-4 bg-medical-primary text-white rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">啟動評估</button>
                      )}
                    </div>
                  </div>

                  {analysis ? (
                    <div className="grid md:grid-cols-2 gap-8">
                      <section className="bg-white rounded-3xl p-8 border border-medical-border shadow-sm">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-medical-primary mb-6">能力雷達圖</h3>
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                              <PolarGrid stroke="#E2E8CE" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#4A5D4A', fontSize: 10, fontWeight: 'bold' }} />
                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                              <Tooltip wrapperStyle={{ fontSize: '10px', outline: 'none' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                              <Radar name="Student" dataKey="A" stroke="#7D8C7D" fill="#7D8C7D" fillOpacity={0.6} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </section>

                      <div className="space-y-6">
                        <div className="bg-medical-primary text-white rounded-3xl p-8 shadow-xl">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-4">綜合評定</h4>
                          <div className="text-5xl font-serif font-bold italic mb-3">
                            {analysis.empathyLevel === 'Great' ? '卓越表現' : 
                             analysis.empathyLevel === 'High' ? '專業優異' : 
                             analysis.empathyLevel === 'Medium' ? '表現穩定' : '尚有進步空間'}
                          </div>
                          <p className="text-[11px] leading-relaxed opacity-80">{analysis.suggestions[0]}</p>
                        </div>
                        <div className="bg-green-50 p-6 rounded-3xl border border-green-100">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-green-700 mb-4 flex items-center gap-2">
                            <CircleCheck size={16} /> 溝通優點 (Strengths)
                          </h3>
                          <ul className="space-y-3">
                            {(analysis.strengths || []).slice(0, 3).map((item: string, i: number) => (
                              <li key={i} className="text-[11px] text-green-900 leading-relaxed flex gap-2">
                                <span className="text-green-500 font-bold">✓</span> {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-red-700 mb-4 flex items-center gap-2">
                            <CircleAlert size={16} /> 待改進空間 (Weaknesses)
                          </h3>
                          <ul className="space-y-3">
                            {(analysis.weaknesses || []).slice(0, 3).map((item: string, i: number) => (
                              <li key={i} className="text-[11px] text-red-900 leading-relaxed flex gap-2">
                                <span className="text-red-500 font-bold">⚠</span> {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {analysis.patientVoice && (
                          <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 mt-6 relative overflow-hidden">
                             <div className="absolute -top-4 -right-4 text-9xl font-serif text-blue-500 opacity-10 select-none">"</div>
                             <h3 className="text-xs font-bold uppercase tracking-widest text-blue-700 mb-4 flex items-center gap-2">
                                <UserCircle size={16} /> 病患心聲 (Patient's Voice)
                             </h3>
                             <p className="text-[13px] text-blue-900 leading-relaxed italic relative z-10 font-medium tracking-wide">
                               "{analysis.patientVoice}"
                             </p>
                          </div>
                        )}
                        <div className="bg-orange-50/50 p-6 rounded-3xl border border-orange-100 mt-6">
                           <div className="flex justify-between items-center mb-4">
                             <h3 className="text-xs font-bold uppercase tracking-widest text-orange-800 flex items-center gap-2">
                               <FileText size={16} /> AI Scribing (SOAP Note)
                             </h3>
                             {!soapNote && (
                               <button 
                                 onClick={handleGenerateSoapNote}
                                 disabled={isGeneratingSoap}
                                 className="text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-900 font-bold py-1 px-3 rounded-full transition-colors flex items-center gap-1"
                               >
                                 {isGeneratingSoap ? <span className="animate-pulse">生成中...</span> : <>一鍵生成病歷紀錄 <ChevronRight size={12} /></>}
                               </button>
                             )}
                           </div>
                           {soapNote ? (
                             <div className="text-[12px] text-gray-700 leading-relaxed font-mono bg-white p-4 rounded-xl border border-orange-100 whitespace-pre-wrap">
                               {soapNote}
                             </div>
                           ) : (
                             <p className="text-[11px] text-orange-700/70">
                               系統能運用 AI 分析對話內容，自動化生成主觀與客觀資訊的醫療病歷，供學生學習如何將人文關懷轉換為正確的臨床 SOAP 紀錄。
                             </p>
                           )}
                        </div>
                      </div>
                    </div>
                  ) : showAnalysis && <div className="text-center py-20 font-serif italic text-medical-primary">AI 正在計算人文指標...</div>}
                </div>
              </motion.div>
            )}

            {activeTab === 'Reflections' && (
              <motion.div key="reflections" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 p-8 overflow-hidden flex gap-6">
                <div className="w-80 flex flex-col gap-4">
                  <h3 className="text-xl font-serif font-medium text-medical-dark">選擇紀錄 (Select Session)</h3>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                    {loadingSessions ? (
                      <div className="text-center py-10 text-xs text-medical-secondary animate-pulse">讀取中...</div>
                    ) : pastSessions.length === 0 ? (
                      <div className="text-center py-10 text-xs text-medical-secondary italic">尚無練習記錄</div>
                    ) : (
                      pastSessions.map((session) => (
                        <div
                          key={session.id}
                          onClick={() => fetchSessionDetails(session)}
                          role="button"
                          className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                            selectedPastSession?.id === session.id
                              ? 'border-medical-primary bg-medical-soft shadow-sm'
                              : 'border-medical-border bg-white hover:border-medical-primary/50'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold text-medical-primary uppercase tracking-widest">
                              {session.type === 'individual' ? '擬真診間' : '團隊協作'}
                            </span>
                            <span className="text-[9px] text-medical-secondary">
                              {safeGetDateString(session)}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-medical-dark truncate mb-1">
                             {PATIENT_PERSONAS.find(p => p.id === session.patientId)?.name || '未知病患'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex-1 bg-white rounded-[2rem] border border-medical-border shadow-lg p-10 flex flex-col gap-6 relative">
                  {(selectedPastSession || sessionId) ? (
                    <>
                      <h2 className="text-3xl font-serif font-medium text-medical-dark italic flex items-center justify-center gap-4">
                        <PenTool className="text-medical-accent" size={28} /> 敘事醫學反思寫作
                      </h2>
                      <div className="text-center text-sm text-medical-secondary mb-4">
                        正在為 {selectedPastSession ? (selectedPastSession.type === 'individual' ? '擬真診間' : '團隊協作') : '目前模擬'} - 
                        {PATIENT_PERSONAS.find(p => p.id === (selectedPastSession?.patientId || selectedPatient?.id))?.name} 撰寫反思
                      </div>
                      <textarea 
                        placeholder="在這裡靜心記錄您的觀察與反思..."
                        value={reflectionText}
                        onChange={(e) => setReflectionText(e.target.value)}
                        className="flex-1 min-h-[350px] p-8 bg-medical-bg rounded-[2rem] border border-medical-border focus:outline-none focus:ring-4 focus:ring-medical-primary/5 text-medical-dark text-sm resize-none custom-scrollbar"
                      />
                      <button 
                        onClick={() => handleSaveReflection(selectedPastSession?.id || sessionId!)}
                        className={`px-10 py-4 text-white rounded-full text-xs font-bold uppercase tracking-widest self-center shadow-lg transition-all bg-medical-primary hover:bg-medical-dark`}
                      >
                        儲存反思日誌
                      </button>
                    </>
                  ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-medical-secondary/50">
                        <PenTool size={48} className="opacity-20 mb-6" />
                        <p className="text-sm font-medium tracking-wide">請從左側選擇一個練習紀錄，或是啟動一場模擬對話開始反思</p>
                      </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'History' && (() => {
              const safeGetDateString = (s: any) => {
                if (!s.createdAt) return '未知時間';
                if (typeof s.createdAt.toDate === 'function') {
                  return s.createdAt.toDate().toLocaleDateString();
                }
                const date = new Date(s.createdAt);
                if (!isNaN(date.getTime())) {
                  return date.toLocaleDateString();
                }
                return '未知時間';
              };
              
              const uniqueDates = Array.from(new Set(pastSessions.map(safeGetDateString))).filter(d => d !== '未知時間') as string[];
              const displaySessions = selectedDateFilter === 'All' 
                ? pastSessions 
                : pastSessions.filter(s => safeGetDateString(s) === selectedDateFilter);
              
              return (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 p-8 overflow-hidden flex gap-6">
                <div className="w-56 flex flex-col gap-4">
                  <h3 className="text-xl font-serif font-medium text-medical-dark">練習歷程</h3>
                  <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                    <div 
                      onClick={() => setSelectedDateFilter('All')}
                      className={`p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                        selectedDateFilter === 'All' 
                          ? 'border-medical-primary bg-medical-soft text-medical-primary shadow-sm' 
                          : 'border-transparent text-medical-secondary hover:bg-medical-soft/30 hover:text-medical-dark'
                      }`}
                    >
                      全部紀錄
                    </div>
                    {uniqueDates.map(date => (
                      <div 
                        key={date}
                        onClick={() => setSelectedDateFilter(date)}
                        className={`p-3 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                          selectedDateFilter === date
                            ? 'border-medical-primary bg-medical-soft text-medical-primary shadow-sm' 
                            : 'border-transparent text-medical-secondary hover:bg-medical-soft/30 hover:text-medical-dark'
                        }`}
                      >
                        {date}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-4 space-y-6 custom-scrollbar">
                  
                  <div className="bg-medical-primary/5 rounded-2xl p-6 border border-medical-primary/20">
                    <div className="flex items-center justify-between mb-2">
                       <h4 className="text-medical-dark font-medium font-serif flex items-center gap-2">
                         <Brain size={18} className="text-medical-primary" /> 
                         跨階段學習洞察 (Cross-Session Insight)
                       </h4>
                       <button
                         onClick={handleGenerateInsight}
                         disabled={isGeneratingInsight || pastSessions.length === 0}
                         className={`px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase transition-all ${isGeneratingInsight ? 'bg-medical-soft text-medical-secondary cursor-not-allowed' : 'bg-medical-primary text-white hover:bg-medical-dark shadow-sm hover:shadow-md'}`}
                       >
                         {isGeneratingInsight ? '生成中...' : '生成陪伴式總體評價'}
                       </button>
                    </div>
                    {insightReport ? (
                       <div className="mt-4 p-4 bg-white rounded-xl text-sm text-medical-dark/80 whitespace-pre-wrap leading-relaxed shadow-sm border border-medical-border markdown-body">
                         <Markdown>{insightReport}</Markdown>
                       </div>
                    ) : (
                       <p className="text-sm text-medical-secondary mt-1">累積足夠的練習次數後，點擊生成，AI 導師將為您調閱過去紀錄，進行個人化成長分析與指導。</p>
                    )}
                  </div>

                  {loadingSessions ? (
                    <div className="flex items-center justify-center h-40 text-medical-secondary/50 animate-pulse">讀取中...</div>
                  ) : displaySessions.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-medical-secondary/50 italic">無紀錄</div>
                  ) : (
                    displaySessions.map((session) => (
                      <div key={session.id} className="bg-white rounded-2xl border border-medical-border shadow-sm overflow-hidden flex flex-col">
                        <div className="p-6 flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-[10px] font-bold text-white bg-medical-primary px-2.5 py-1 rounded-full uppercase tracking-widest">
                                {session.type === 'individual' ? '擬真診間' : '團隊協作'}
                              </span>
                              <span className="text-xs text-medical-secondary font-medium">
                                {safeGetDateString(session)}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${session.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                {session.status === 'completed' ? '已完成' : '進行中'}
                              </span>
                            </div>
                            <h4 className="text-lg font-serif font-bold text-medical-dark mb-1">
                              {PATIENT_PERSONAS.find(p => p.id === session.patientId)?.name || '未知個案'}
                            </h4>
                            <p className="text-sm text-medical-secondary line-clamp-2 mt-2">
                              {PATIENT_PERSONAS.find(p => p.id === session.patientId)?.chiefComplaint}
                            </p>
                          </div>
                          
                          <div className="flex flex-col items-end gap-3 self-stretch justify-between">
                            <button 
                              onClick={(e) => handleDeleteSession(e, session.id)}
                              disabled={isDeleting === session.id}
                              className="text-medical-secondary hover:text-medical-accent p-2 rounded-full hover:bg-medical-accent/10 transition-colors"
                              title="刪除"
                            >
                               {isDeleting === session.id ? <div className="w-4 h-4 border-2 border-medical-accent border-t-transparent rounded-full animate-spin"></div> : <Trash2 size={16} />}
                            </button>
                            
                            <div className="flex gap-2">
                              <button 
                                onClick={() => alert('已送出人工查核！')}
                                className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all bg-medical-primary/10 text-medical-primary hover:bg-medical-primary hover:text-white"
                              >
                                送出查核
                              </button>
                              <button 
                                onClick={() => toggleExpandMode('details', session)}
                                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all ${selectedPastSession?.id === session.id && expandedMode === 'details' ? 'bg-medical-dark text-white' : 'bg-medical-soft text-medical-dark hover:bg-medical-border'}`}
                              >
                                {selectedPastSession?.id === session.id && expandedMode === 'details' ? '收起詳情' : '展開詳情'}
                              </button>
                              <button 
                                onClick={() => toggleExpandMode('reflection', session)}
                                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full transition-all ${selectedPastSession?.id === session.id && expandedMode === 'reflection' ? 'bg-medical-accent text-white' : 'bg-white border text-medical-accent border-medical-accent hover:bg-medical-accent hover:text-white shadow-sm'}`}
                              >
                                {selectedPastSession?.id === session.id && expandedMode === 'reflection' ? '收起反思' : '撰寫反思'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Collapsed Sections Container */}
                        <AnimatePresence>
                          {selectedPastSession?.id === session.id && expandedMode && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }} 
                              animate={{ height: 'auto', opacity: 1 }} 
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-medical-border bg-medical-bg/20 overflow-hidden break-words"
                            >
                              
                              {/* Details Mode */}
                              {expandedMode === 'details' && (
                                <div className="p-6 space-y-8 min-w-0">
                                  {/* AI Tutors / Reports */}
                                  <div className="flex items-center gap-3 justify-end mb-4 flex-wrap">
                                      {(selectedPastEvaluation && !selectedPastEvaluation.soapNote && selectedPastEvaluation.id) && (
                                        <button 
                                          onClick={handleGenerateSoapNotePast}
                                          disabled={isGeneratingSoap}
                                          className="flex items-center gap-1.5 px-4 py-2 bg-orange-100/80 text-orange-800 rounded-full text-[10px] font-bold hover:bg-orange-200 transition-all font-medium border border-orange-200 shrink-0"
                                        >
                                          <FileText size={12} /> {isGeneratingSoap ? '生成中...' : '生成 SOAP Note'}
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => exportReport(pastMessages, selectedPastEvaluation)}
                                        className="flex items-center gap-2 px-4 py-2 bg-medical-primary/10 text-medical-primary rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-medical-primary/20 transition-all shrink-0"
                                      >
                                        <Download size={12} /> 匯出報告
                                      </button>
                                  </div>

                                  <div className="grid lg:grid-cols-2 gap-8 items-stretch min-w-0 mb-6">
                                    <div className="min-w-0 break-words h-full">
                                      {/* Medical Summary in details */}
                                      <div className="bg-white p-5 rounded-2xl border shadow-sm break-words h-full flex flex-col">
                                        <h5 className="text-[10px] font-bold uppercase text-medical-primary tracking-widest mb-3 flex items-center gap-2 shrink-0">
                                           <div className="w-1.5 h-1.5 rounded-full bg-medical-primary"></div> 對話實錄
                                        </h5>
                                        <div className="flex-1 min-h-0 relative">
                                          <div className="absolute inset-0 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                                            {pastMessages.map((msg, i) => (
                                              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`p-3 text-xs leading-relaxed break-words break-all whitespace-pre-wrap shrink ${
                                                  msg.role === 'user' 
                                                    ? 'bg-medical-primary text-white rounded-2xl rounded-br-none max-w-[90%] shadow-sm' 
                                                    : 'bg-medical-bg border border-medical-border text-medical-dark rounded-2xl rounded-tl-none max-w-[90%]'
                                                }`}>
                                                  <div className="text-[8px] font-bold opacity-60 mb-1 uppercase tracking-tighter shrink-0">{msg.roleName}</div>
                                                  {msg.text}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Evaluation radar */}
                                    {selectedPastEvaluation && (
                                      <div className="bg-white p-5 rounded-2xl border shadow-sm min-w-0">
                                        <h5 className="text-[10px] font-bold uppercase text-medical-primary tracking-widest mb-4 flex items-center gap-2 shrink-0">
                                           <div className="w-1.5 h-1.5 rounded-full bg-medical-accent"></div> 專業評估分析
                                        </h5>
                                        <div className="h-48 mb-4 w-full shrink-0">
                                          <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={[
                                              { subject: '人文', A: selectedPastEvaluation.scores?.humanity || 0 },
                                              { subject: '專業', A: selectedPastEvaluation.scores?.professionalism || 0 },
                                              { subject: '溝通', A: selectedPastEvaluation.scores?.communication || 0 },
                                              { subject: '共情', A: selectedPastEvaluation.scores?.empathy || 0 },
                                              { subject: '倫理', A: selectedPastEvaluation.scores?.ethics || 0 },
                                              ...(selectedPastEvaluation.scores?.interdisciplinary ? [{ subject: '協作', A: selectedPastEvaluation.scores.interdisciplinary }] : [])
                                            ]}>
                                              <PolarGrid stroke="#E5E7EB" />
                                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 600 }} />
                                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                                              <Tooltip wrapperStyle={{ fontSize: '10px', outline: 'none' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                              <Radar name="得分" dataKey="A" stroke="#2D4D47" fill="#2D4D47" fillOpacity={0.6} />
                                            </RadarChart>
                                          </ResponsiveContainer>
                                        </div>
                                        <div className="text-center text-lg font-serif font-medium text-medical-dark mb-4 shrink-0">
                                            {selectedPastEvaluation.empathyLevel === 'Great' ? '卓越表現' : 
                                             selectedPastEvaluation.empathyLevel === 'High' ? '專業優異' : 
                                             selectedPastEvaluation.empathyLevel === 'Medium' ? '表現穩定' : '尚有進步空間'}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 min-w-0">
                                            <div className="p-3 bg-green-50 rounded-xl border border-green-100 break-words min-w-0">
                                              <div className="text-[9px] font-bold text-green-700 uppercase mb-1 shrink-0">優點回顧</div>
                                              <div className="text-[12px] text-green-900 space-y-1">
                                                {(selectedPastEvaluation.strengths || []).slice(0, 2).map((item: string, idx: number) => (
                                                  <div key={idx} className="line-clamp-2 shrink">• {item}</div>
                                                ))}
                                              </div>
                                            </div>
                                            <div className="p-3 bg-red-50 rounded-xl border border-red-100 break-words min-w-0">
                                              <div className="text-[9px] font-bold text-red-700 uppercase mb-1 shrink-0">挑戰回顧</div>
                                              <div className="text-[12px] text-red-900 space-y-1">
                                                {(selectedPastEvaluation.weaknesses || []).slice(0, 2).map((item: string, idx: number) => (
                                                  <div key={idx} className="line-clamp-2 shrink">• {item}</div>
                                                ))}
                                              </div>
                                            </div>
                                        </div>
                                        {selectedPastEvaluation.patientVoice && (
                                            <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100 break-words min-w-0 relative overflow-hidden">
                                              <div className="text-[9px] font-bold text-blue-700 uppercase mb-1 shrink-0">病患心聲</div>
                                              <div className="text-[12px] text-blue-900 italic relative z-10 leading-relaxed font-medium">
                                                "{selectedPastEvaluation.patientVoice}"
                                              </div>
                                              <div className="absolute -top-2 -right-2 text-6xl font-serif text-blue-500 opacity-10 select-none">"</div>
                                            </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {selectedPastEvaluation?.soapNote && (
                                     <div className="mb-6 bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                                       <div className="flex justify-between items-center mb-2">
                                         <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-800 flex items-center gap-2">
                                           <FileText size={14} /> AI Scribing (SOAP Note)
                                         </h3>
                                         <button 
                                           onClick={() => exportSoapNote(selectedPastEvaluation.soapNote, PATIENT_PERSONAS.find(p => p.id === selectedPastSession?.patientId)?.name || '未知個案')}
                                           className="flex items-center gap-1.5 px-3 py-1 bg-white text-orange-700 border border-orange-200 rounded-full text-[9px] font-bold hover:bg-orange-100 transition-all shadow-sm"
                                         >
                                           <Download size={10} /> 匯出
                                         </button>
                                       </div>
                                       <div className="text-[12px] text-gray-700 leading-relaxed font-mono bg-white p-3 rounded-xl border border-orange-100 whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                                         {selectedPastEvaluation.soapNote}
                                       </div>
                                     </div>
                                  )}
                                </div>
                              )}

                              {/* Reflection Mode */}
                              {expandedMode === 'reflection' && (
                                <div className="p-6 bg-medical-soft/30">
                                  <div className="flex justify-between items-center mb-4 relative">
                                    <h5 className="text-sm font-serif font-medium text-medical-dark flex items-center gap-2">
                                       <PenTool size={16} className="text-medical-accent" /> 敘事醫學反思寫作
                                    </h5>
                                    <div>
                                      <button 
                                        onClick={() => setShowPrompt(!showPrompt)}
                                        className="text-xs flex items-center gap-1.5 text-medical-accent hover:bg-medical-accent/10 px-3 py-1.5 rounded-full transition-all border border-medical-accent/30 bg-white shadow-sm"
                                      >
                                          💡 靈感提示
                                      </button>
                                      <AnimatePresence>
                                        {showPrompt && (
                                          <motion.div 
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute right-0 top-10 w-64 bg-white border border-medical-border shadow-xl p-4 rounded-2xl z-10 text-sm text-medical-dark"
                                          >
                                            <div className="text-[10px] font-bold text-medical-secondary mb-2">反思引導區塊：</div>
                                            <p className="italic text-medical-dark">{randomPrompt}</p>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  </div>
                                  <textarea 
                                    placeholder="靜心記錄下此練習帶來的心得與反饋...\n例如您觀察到的盲點、病灶或者是溝通的轉折。"
                                    value={reflectionText}
                                    onChange={(e) => setReflectionText(e.target.value)}
                                    className="w-full min-h-[220px] p-5 bg-white rounded-2xl border border-medical-border focus:outline-none focus:ring-2 focus:ring-medical-primary/20 text-medical-dark text-sm resize-none custom-scrollbar mb-4"
                                  />
                                  <div className="flex justify-end">
                                    <button 
                                      onClick={() => handleSaveReflection(session.id)}
                                      className="px-8 py-2.5 bg-medical-primary hover:bg-medical-dark transition-all text-white rounded-full text-xs font-bold tracking-widest shadow-md"
                                    >
                                      儲存反思
                                    </button>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>

                      </div>
                    ))
                  )}
                </div>
              </motion.div>
              );
            })()}
            {activeTab === 'ManualReview' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-4xl mx-auto w-full flex flex-col h-full bg-white rounded-3xl border border-medical-border/60 shadow-sm overflow-hidden"
              >
                <div className="p-6 border-b border-medical-border flex justify-between items-center bg-medical-soft/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-medical-primary/10 flex items-center justify-center text-medical-primary">
                       <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="font-serif font-semibold text-lg text-medical-dark">人工查核面板</h4>
                      <p className="text-[10px] uppercase text-medical-secondary font-bold tracking-widest mt-0.5">MANUAL REVIEW DASHBOARD</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-medical-bg/30 relative">
                  {loadingSessions ? (
                    <div className="flex items-center justify-center h-full text-medical-secondary font-medium animate-pulse">載入中...</div>
                  ) : pastSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-medical-secondary">
                      <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm mb-4">
                        <FileText size={24} className="opacity-20" />
                      </div>
                      尚未有可供查核的紀錄
                    </div>
                  ) : (
                    pastSessions.map(session => (
                      <div key={session.id} className="bg-white rounded-2xl border border-medical-border p-5 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="text-[10px] font-bold text-medical-secondary tracking-widest uppercase mb-1">
                               Session ID: {session.id.slice(0, 8)}
                            </div>
                            <h5 className="font-medium text-medical-dark">{session.patientName || '模擬訓練'} - {session.patientRole || '未指定'}</h5>
                          </div>
                          <span className="text-xs text-medical-primary bg-medical-primary/10 px-3 py-1 rounded-full font-bold">待查核</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <button 
                             onClick={() => alert('即將開放：檢視對話紀錄功能')}
                             className="text-xs font-semibold py-2 rounded-xl text-medical-dark border border-medical-border hover:bg-medical-soft/40 transition-colors flex items-center justify-center gap-2"
                           >
                             <Monitor size={14} /> 檢視完整對話紀錄
                           </button>
                           <button 
                             onClick={() => alert('即將開放：撰寫查核回饋功能')}
                             className="text-xs font-semibold py-2 rounded-xl text-white bg-medical-primary hover:bg-medical-dark transition-colors flex items-center justify-center gap-2"
                           >
                             <FileText size={14} /> 撰寫查核回饋
                           </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </section>
      </main>
    </>
  )}

      <footer className="h-10 bg-white border-t border-medical-border flex items-center px-8 justify-between text-[#A3A3A3] flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-medical-primary rounded-full" />
            <span className="text-[9px] font-bold uppercase tracking-widest">系統連線正常 (加密模式)</span>
          </div>
        </div>
        <div className="text-[9px] font-bold uppercase tracking-widest text-medical-primary flex gap-4 italic opacity-70">
          <span>MEDILOGUE 團隊 監製</span>
        </div>
      </footer>
      {/* AI Tutor Proactive Alert */}
      <AnimatePresence>
        {activeTutorHint && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-medical-dark/20 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-medical-border overflow-hidden"
            >
              <div className={`h-2 w-full ${
                activeTutorHint.type === 'clinical' ? 'bg-medical-primary' : 
                activeTutorHint.type === 'ethical' ? 'bg-amber-500' : 'bg-medical-accent'
              }`} />
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    activeTutorHint.type === 'clinical' ? 'bg-medical-soft text-medical-primary' : 
                    activeTutorHint.type === 'ethical' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-medical-accent'
                  }`}>
                    {activeTutorHint.type === 'clinical' ? <Brain size={24} /> : 
                     activeTutorHint.type === 'ethical' ? <BookOpen size={24} /> : <CircleAlert size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-medical-dark font-sans leading-tight">
                      {activeTutorHint.title}
                    </h3>
                    <p className="text-xs text-medical-secondary font-medium tracking-wide uppercase mt-1">
                      AI 導師關鍵提示
                    </p>
                  </div>
                </div>
                
                <div className="bg-medical-soft/30 p-5 rounded-2xl border border-medical-border/50 mb-8">
                  <p className="text-medical-secondary leading-relaxed text-sm">
                    {activeTutorHint.content}
                  </p>
                </div>

                <button 
                  onClick={() => setActiveTutorHint(null)}
                  className="w-full py-4 bg-medical-primary text-white rounded-2xl font-bold hover:bg-medical-dark transition-all shadow-lg flex items-center justify-center gap-2 group"
                >
                  <span>我已了解，繼續模擬</span>
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Intrusion Flash Event */}
      <AnimatePresence>
        {isIntruding && (
          <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.5, 0.2, 0.5, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="absolute inset-0 bg-red-600"
            />
            <div className="absolute inset-0 flex items-center justify-center p-6 bg-red-900/10">
              <motion.div 
                initial={{ scale: 0.5, opacity: 0, rotate: -5 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 1.5, opacity: 0 }}
                className="bg-white/95 backdrop-blur-md p-8 rounded-[3rem] shadow-[0_0_100px_rgba(220,38,38,0.4)] border-4 border-red-600 flex flex-col items-center text-center gap-4"
              >
                <div className="w-20 h-20 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg animate-bounce">
                  <Zap size={40} />
                </div>
                <div>
                  <h3 className="text-3xl font-serif font-bold text-red-600 leading-tight">突發：家屬強制介入</h3>
                  <p className="text-sm font-bold text-medical-dark/60 uppercase tracking-[0.2em] mt-1">Situational Crisis Triggered</p>
                </div>
                <div className="h-px w-32 bg-red-100 mt-2" />
                <p className="max-w-xs text-sm text-medical-secondary leading-relaxed italic">
                  「這是在醫什麼？我要帶我兒子走！」<br/>
                  <span className="font-bold text-red-600">林爸爸</span> 已闖入診間並強行中斷對話。
                </p>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Artifact Modal */}
      <AnimatePresence>
        {selectedArtifact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 md:p-12 bg-medical-dark/60 backdrop-blur-sm"
            onClick={() => setSelectedArtifact(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[2rem] shadow-2xl border border-medical-border w-full max-w-4xl max-h-full flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-medical-soft bg-[#F8FAF8]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-medical-border flex items-center justify-center text-medical-primary">
                    {selectedArtifact.type === 'image' ? <ImageIcon size={24} /> : <FileText size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-serif font-bold text-medical-dark">{selectedArtifact.title}</h2>
                    <p className="text-xs text-medical-secondary font-medium tracking-wide mt-1">{selectedArtifact.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedArtifact(null)}
                  className="p-3 bg-white rounded-full text-medical-secondary border border-medical-border shadow-sm hover:bg-medical-soft transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {selectedArtifact.type === 'image' && selectedArtifact.imageUrl ? (
                  <div className="flex flex-col gap-6">
                    <img 
                      src={selectedArtifact.imageUrl} 
                      alt={selectedArtifact.title} 
                      className="w-full h-auto rounded-2xl shadow-sm border border-medical-border"
                      referrerPolicy="no-referrer"
                    />
                    {selectedArtifact.content && (
                      <div className="prose prose-sm max-w-none text-medical-dark whitespace-pre-wrap">
                        {selectedArtifact.content}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white border rounded-2xl p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] shadow-inner border-medical-border min-h-[400px]">
                    <div className="prose prose-sm sm:prose-base max-w-none text-medical-dark whitespace-pre-wrap font-mono leading-relaxed">
                      {selectedArtifact.content}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
