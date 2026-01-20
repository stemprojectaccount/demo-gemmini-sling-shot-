/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { generateQuizQuestion } from '../services/geminiService';
import { Point, Bubble, Particle, BubbleColor, UserProfile, QuizQuestion, LeaderboardEntry, Difficulty } from '../types';
import { Loader2, Trophy, Play, Pause, BrainCircuit, CheckCircle2, XCircle, User, School, BookOpen, Crown, Save, LogOut, Medal, Gauge, Star, Sparkles, Zap, Infinity as InfinityIcon, GraduationCap, PenTool, Dices, Shuffle, Plus, Trash2, FileText, Edit3 } from 'lucide-react';

// --- Constants & Config ---

const PINCH_THRESHOLD = 0.05;
const GRAVITY = 0.25; 
const FRICTION = 0.99; 

// Reduced Bubble Size (Smaller for more density)
const BUBBLE_RADIUS = 20; 
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);

// Dynamic Grid: Max columns increased for desktop since bubbles are smaller
const MAX_GRID_COLS = 16; 
const GRID_ROWS = 10; 
const SLINGSHOT_BOTTOM_OFFSET = 220;

const MAX_DRAG_DIST = 180;
const MIN_FORCE_MULT = 0.15;
const MAX_FORCE_MULT = 0.45;

const POP_DURATION = 350;
const SMOOTHING_FACTOR = 0.25;

// Difficulty Settings (Increased initialRows for denser grid)
const DIFFICULTY_CONFIG: Record<Difficulty, { dropInterval: number, initialRows: number, density: number, label: string, color: string, winScore: number }> = {
    Easy:   { dropInterval: 60000, initialRows: 6, density: 0.85, label: 'Easy',   color: '#4ade80', winScore: 3000 },
    Medium: { dropInterval: 40000, initialRows: 8, density: 0.9, label: 'Medium', color: '#facc15', winScore: 8000 },
    Hard:   { dropInterval: 20000, initialRows: 10, density: 0.95, label: 'Hard',   color: '#ef4444', winScore: 15000 },
    Infinity: { dropInterval: 30000, initialRows: 9, density: 0.9, label: 'Infinity', color: '#d8b4fe', winScore: Number.MAX_SAFE_INTEGER }
};

// VIBRANT Colors (Sặc sỡ) for Dark Mode Contrast
const COLOR_CONFIG: Record<BubbleColor, { hex: string, points: number, label: string }> = {
  red:    { hex: '#FF0000', points: 100, label: 'Red' },       // Pure Vibrant Red
  blue:   { hex: '#0080FF', points: 150, label: 'Blue' },      // Bright Azure
  green:  { hex: '#00E676', points: 200, label: 'Green' },     // Neon Green
  yellow: { hex: '#FFEA00', points: 250, label: 'Yellow' },    // Vivid Yellow
  purple: { hex: '#D500F9', points: 300, label: 'Purple' },    // Electric Purple
  orange: { hex: '#FF6D00', points: 500, label: 'Orange' }     // Bright Orange
};

const COLOR_KEYS: BubbleColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

// Expanded English Topics List for Randomizer & Suggestions
const ENGLISH_TOPICS = [
    "Grade 6 Vocabulary (VN)",
    "Grade 7 Vocabulary (VN)",
    "Grade 8 Vocabulary (VN)",
    "Grade 9 Vocabulary (VN)",
    "Cambridge Prepare! A1",
    "Cambridge Prepare! A2",
    "IELTS Speaking Part 1",
    "Business English Basics",
    "Travel Vocabulary",
    "Cooking & Food",
    "Technology & AI",
    "Harry Potter Vocabulary",
    "Marvel Universe Terms",
    "Daily Routine Idioms",
    "Phrasal Verbs for School"
];

interface FloatingText {
    x: number;
    y: number;
    text: string;
    life: number; // 1.0 to 0.0
    color: string;
    vy: number;
}

const adjustColor = (color: string, amount: number) => {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    
    const componentToHex = (c: number) => {
        const hex = c.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

const isNeighbor = (a: Bubble, b: Bubble) => {
    const dr = b.row - a.row;
    const dc = b.col - a.col;
    if (Math.abs(dr) > 1) return false;
    if (dr === 0) return Math.abs(dc) === 1;
    if (a.row % 2 !== 0) {
        return dc === 0 || dc === 1;
    } else {
        return dc === -1 || dc === 0;
    }
};

// --- AUDIO SYSTEM ---
const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
const audioCtx = new AudioContextClass();
let lastBounceTime = 0;

const playSound = (type: 'shoot' | 'pop' | 'bounce' | 'hit' | 'correct' | 'incorrect' | 'win' | 'gameover' | 'tick') => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    switch (type) {
        case 'shoot':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(500, now + 0.2);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;
        case 'pop':
            osc.type = 'sine';
            const freq = 500 + Math.random() * 300; 
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.03, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
        case 'bounce':
            if (now - lastBounceTime < 0.08) return;
            lastBounceTime = now;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
            gain.gain.setValueAtTime(0.03, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        case 'hit':
             osc.type = 'triangle';
             osc.frequency.setValueAtTime(350, now);
             osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
             gain.gain.setValueAtTime(0.04, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
             osc.start(now);
             osc.stop(now + 0.1);
             break;
        case 'correct':
            [659.25, 830.61, 987.77].forEach((f, i) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'sine';
                o.frequency.value = f;
                o.connect(g);
                g.connect(audioCtx.destination);
                const t = now + i * 0.1;
                g.gain.setValueAtTime(0.04, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
                o.start(t);
                o.stop(t + 0.8);
            });
            break;
        case 'incorrect':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(150, now + 0.3);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
            break;
        case 'win':
            [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'triangle';
                o.frequency.value = f;
                o.connect(g);
                g.connect(audioCtx.destination);
                const t = now + i * 0.15;
                g.gain.setValueAtTime(0.03, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
                o.start(t);
                o.stop(t + 0.6);
            });
            break;
        case 'gameover':
             osc.type = 'sawtooth';
             osc.frequency.setValueAtTime(200, now);
             osc.frequency.exponentialRampToValueAtTime(50, now + 1.0);
             gain.gain.setValueAtTime(0.05, now);
             gain.gain.linearRampToValueAtTime(0.001, now + 1.0);
             osc.start(now);
             osc.stop(now + 1.0);
             break;
        case 'tick':
             osc.type = 'triangle';
             osc.frequency.setValueAtTime(800, now);
             gain.gain.setValueAtTime(0.02, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
             osc.start(now);
             osc.stop(now + 0.05);
             break;
    }
};

const GeminiSlingshot: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  
  // Game State Refs
  const ballPos = useRef<Point>({ x: 0, y: 0 });
  const ballVel = useRef<Point>({ x: 0, y: 0 });
  const anchorPos = useRef<Point>({ x: 0, y: 0 });
  const isPinching = useRef<boolean>(false);
  const isDragging = useRef<boolean>(false); // Track touch drag
  const isFlying = useRef<boolean>(false);
  const flightStartTime = useRef<number>(0);
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<Particle[]>([]);
  const floatingTexts = useRef<FloatingText[]>([]);
  const potentialMatchesRef = useRef<string[]>([]);
  
  // Dynamic Grid
  const gridColsRef = useRef<number>(MAX_GRID_COLS);

  // Hand Stabilization Ref
  const prevHandPos = useRef<Point | null>(null);

  const scoreRef = useRef<number>(0);
  const lastDropTimeRef = useRef<number>(0);
  const hasWonRef = useRef<boolean>(false);
  
  // Logic Control
  const isQuizActiveRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const pendingMatchesRef = useRef<Bubble[]>([]);
  const gameOverRef = useRef<boolean>(false);
  
  const currentAmmoRef = useRef<BubbleColor>('red');
  const nextAmmoRef = useRef<BubbleColor>('blue');
  
  // React State
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [currentAmmo, setCurrentAmmo] = useState<BubbleColor>('red');
  const [nextAmmo, setNextAmmo] = useState<BubbleColor>('blue');
  const [isPaused, setIsPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  // Registration Form State
  const [formInput, setFormInput] = useState<UserProfile>({ 
      name: '', 
      className: '', 
      topic: '', 
      difficulty: 'Medium',
      customQuestions: []
  });
  const [isRandomizing, setIsRandomizing] = useState(false);
  
  // Custom Question Builder State
  const [showQuestionBuilder, setShowQuestionBuilder] = useState(false);
  const [tempQuestion, setTempQuestion] = useState({ q: '', a: '', e: '' });

  const [quizData, setQuizData] = useState<QuizQuestion | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizResult, setQuizResult] = useState<'correct' | 'incorrect' | null>(null);
  const [pendingMatches, setPendingMatches] = useState<Bubble[]>([]);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => { currentAmmoRef.current = currentAmmo; }, [currentAmmo]);
  useEffect(() => { nextAmmoRef.current = nextAmmo; }, [nextAmmo]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { pendingMatchesRef.current = pendingMatches; }, [pendingMatches]);
  useEffect(() => { gameOverRef.current = gameOver; if (gameOver) playSound('gameover'); }, [gameOver]);

  useEffect(() => {
    const saved = localStorage.getItem('gemini_slingshot_leaderboard');
    if (saved) {
        try { setLeaderboard(JSON.parse(saved)); } catch (e) { console.error("Failed to load leaderboard"); }
    }
  }, []);

  const saveToLeaderboard = () => {
      if (!userProfile) return;
      const newEntry: LeaderboardEntry = {
          name: userProfile.name,
          className: userProfile.className,
          score: scoreRef.current,
          date: new Date().toLocaleDateString(),
          difficulty: userProfile.difficulty
      };
      const updated = [...leaderboard, newEntry].sort((a, b) => b.score - a.score).slice(0, 100);
      setLeaderboard(updated);
      localStorage.setItem('gemini_slingshot_leaderboard', JSON.stringify(updated));
      setShowLeaderboard(true);
      setIsPaused(true);
  };
  
  const handleRandomizeTopic = () => {
      if(isRandomizing) return;
      setIsRandomizing(true);
      let count = 0;
      const maxCount = 20;
      const interval = setInterval(() => {
          const randomTopic = ENGLISH_TOPICS[Math.floor(Math.random() * ENGLISH_TOPICS.length)];
          setFormInput(prev => ({...prev, topic: randomTopic}));
          playSound('tick');
          count++;
          if (count >= maxCount) {
              clearInterval(interval);
              setIsRandomizing(false);
              playSound('pop');
          }
      }, 50);
  };

  const handleAddCustomQuestion = () => {
      if (!tempQuestion.q || !tempQuestion.a) return;
      const newQ: QuizQuestion = {
          question: tempQuestion.q,
          answer: tempQuestion.a,
          type: 'custom',
          explanation: tempQuestion.e || "Teacher's choice!"
      };
      setFormInput(prev => ({
          ...prev,
          customQuestions: [...(prev.customQuestions || []), newQ]
      }));
      setTempQuestion({ q: '', a: '', e: '' });
      playSound('correct');
  };

  const removeCustomQuestion = (index: number) => {
      setFormInput(prev => ({
          ...prev,
          customQuestions: (prev.customQuestions || []).filter((_, i) => i !== index)
      }));
      playSound('pop');
  };

  const getBubblePos = (row: number, col: number, width: number) => {
    const cols = gridColsRef.current;
    const xOffset = (width - (cols * BUBBLE_RADIUS * 2)) / 2 + BUBBLE_RADIUS;
    const isOdd = row % 2 !== 0;
    const x = xOffset + col * (BUBBLE_RADIUS * 2) + (isOdd ? BUBBLE_RADIUS : 0);
    const y = BUBBLE_RADIUS + row * ROW_HEIGHT;
    return { x, y };
  };

  const getNextBubbleColor = (currentBubbles: Bubble[], forbiddenColors: BubbleColor[] = [], difficulty: Difficulty = 'Medium') => {
      let activeColors = Array.from(new Set(currentBubbles.filter(b => b.active).map(b => b.color)));
      
      // If board is empty (shouldn't happen in gameplay, but safe fallback), return all colors
      if (activeColors.length === 0) return COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];

      let candidates = activeColors.filter(c => !forbiddenColors.includes(c));
      
      // If all active colors are forbidden (rare), try any valid color
      if (candidates.length === 0) candidates = COLOR_KEYS.filter(c => !forbiddenColors.includes(c));
      
      // Still empty? Just pick any color
      if (candidates.length === 0) return COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];

      const introduceNewColorChance = difficulty === 'Infinity' ? 0.35 : (difficulty === 'Hard' ? 0.1 : 0.05);
      if (Math.random() < introduceNewColorChance) {
          const allValid = COLOR_KEYS.filter(c => !forbiddenColors.includes(c));
          if (allValid.length > 0) return allValid[Math.floor(Math.random() * allValid.length)];
      }
      
      return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const initGrid = useCallback((width: number, difficulty: Difficulty) => {
    // Determine responsive grid cols: max possible based on width, but capped at MAX_GRID_COLS
    // Use BUBBLE_RADIUS * 2.2 to allow slight spacing in calculation
    const calculatedCols = Math.max(5, Math.floor((width - 40) / (BUBBLE_RADIUS * 2.1)));
    gridColsRef.current = Math.min(MAX_GRID_COLS, calculatedCols); 

    const newBubbles: Bubble[] = [];
    const config = DIFFICULTY_CONFIG[difficulty];
    
    // INCREASED COLOR VARIETY: 
    // Easy: 4 colors (was 3), Medium: 5 colors (was 4), Hard/Infinity: 6 colors (all)
    let numColors = 5; 
    if (difficulty === 'Easy') numColors = 4;
    if (difficulty === 'Hard') numColors = 6;
    if (difficulty === 'Infinity') numColors = 6;
    
    // Shuffle and slice to get a random set of colors for this level
    const levelPalette = [...COLOR_KEYS].sort(() => Math.random() - 0.5).slice(0, numColors);

    for (let r = 0; r < config.initialRows; r++) { 
      const cols = (r % 2 !== 0 ? gridColsRef.current - 1 : gridColsRef.current);
      for (let c = 0; c < cols; c++) {
        if (Math.random() < config.density) {
            const { x, y } = getBubblePos(r, c, width);
            
            // Relaxed neighbor restriction for more randomness
            const forbidden: BubbleColor[] = [];
            // Only forbid if both top neighbors are same color (creating a triangle) to prevent huge initial blobs
            if (newBubbles.length >= 2) {
                 const prev1 = newBubbles[newBubbles.length - 1];
                 const prev2 = newBubbles[newBubbles.length - 2];
                 if (prev1.row === r && prev1.color === prev2.color) forbidden.push(prev1.color);
            }
            
            // Pick strictly from Level Palette
            let candidates = levelPalette.filter(c => !forbidden.includes(c));
            if (candidates.length === 0) candidates = levelPalette;
            
            const selectedColor = candidates[Math.floor(Math.random() * candidates.length)];

            newBubbles.push({
              id: `${r}-${c}-${Date.now()}`,
              row: r, col: c, x, y,
              color: selectedColor,
              active: true
            });
        }
      }
    }
    bubbles.current = newBubbles;
    lastDropTimeRef.current = performance.now();
    setGameOver(false);
    setGameWon(false);
    hasWonRef.current = false;
    
    const activeColors = Array.from(new Set(newBubbles.map(b => b.color)));
    if (activeColors.length > 0) {
        setCurrentAmmo(activeColors[Math.floor(Math.random() * activeColors.length)]);
        setNextAmmo(activeColors[Math.floor(Math.random() * activeColors.length)]);
    }
  }, []);

  const addNewRow = (canvasWidth: number, canvasHeight: number) => {
      bubbles.current.forEach(b => {
          b.row += 1;
          const pos = getBubblePos(b.row, b.col, canvasWidth);
          b.x = pos.x; b.y = pos.y;
      });
      const lowestY = Math.max(...bubbles.current.filter(b => b.active).map(b => b.y));
      if (lowestY > canvasHeight - SLINGSHOT_BOTTOM_OFFSET - 80) { setGameOver(true); return; }

      const newRowBubbles: Bubble[] = [];
      const colsInRow = gridColsRef.current;
      const difficulty = userProfile ? userProfile.difficulty : 'Medium';
      const density = userProfile ? DIFFICULTY_CONFIG[difficulty].density : 0.85;

      for (let c = 0; c < colsInRow; c++) {
           if (Math.random() < density) {
                const { x, y } = getBubblePos(0, c, canvasWidth);
                const forbidden: BubbleColor[] = [];
                if (newRowBubbles.length >= 2) {
                    const prev1 = newRowBubbles[newRowBubbles.length - 1];
                    const prev2 = newRowBubbles[newRowBubbles.length - 2];
                    if (prev1.color === prev2.color) forbidden.push(prev1.color);
                }
                // Use getNextBubbleColor here to respect "cleared" colors (unless it decides to introduce new ones)
                newRowBubbles.push({
                    id: `new-${Date.now()}-${c}`, row: 0, col: c, x, y,
                    color: getNextBubbleColor(bubbles.current, forbidden, difficulty),
                    active: true
                });
           }
      }
      bubbles.current = [...bubbles.current, ...newRowBubbles];
      lastDropTimeRef.current = performance.now();
  };

  const createExplosion = (x: number, y: number, color: string) => {
    // High energy sparkles
    for (let i = 0; i < 25; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0 + Math.random() * 0.5,
        color
      });
    }
  };

  const addFloatingText = (x: number, y: number, text: string, color: string) => {
      floatingTexts.current.push({
          x, y, text, life: 1.0, color, vy: -2
      });
  };

  const triggerQuiz = async (matches: Bubble[]) => {
      isQuizActiveRef.current = true;
      setPendingMatches(matches);
      setQuizLoading(true);
      setQuizData(null);
      setQuizResult(null);
      setQuizAnswer('');
      
      if (userProfile) {
          // Logic: Prioritize Custom Questions if they exist, otherwise use Gemini
          if (userProfile.customQuestions && userProfile.customQuestions.length > 0) {
              setQuizLoading(true);
              // Fake delay for "thinking" effect
              setTimeout(() => {
                  const randomQ = userProfile.customQuestions![Math.floor(Math.random() * userProfile.customQuestions!.length)];
                  setQuizData(randomQ);
                  setQuizLoading(false);
              }, 600);
          } else {
              setQuizLoading(true);
              const res = await generateQuizQuestion(userProfile.topic, userProfile.className, userProfile.difficulty);
              setQuizData(res.quiz);
              setQuizLoading(false);
          }
      }
  };

  const handleQuizSubmit = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!quizData) return;
      const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,!]/g, '');
      const isCorrect = normalize(quizAnswer) === normalize(quizData.answer);
      setQuizResult(isCorrect ? 'correct' : 'incorrect');
      if (isCorrect) {
          playSound('correct');
          setTimeout(() => completeMatch(true), 1200);
      } else {
          playSound('incorrect');
      }
  };

  const findFloatingBubbles = (allBubbles: Bubble[]) => {
      const connected = new Set<string>();
      const queue: Bubble[] = allBubbles.filter(b => b.row === 0 && b.active && !b.isFloating);
      queue.forEach(b => connected.add(b.id));
      let head = 0;
      while(head < queue.length) {
          const curr = queue[head++];
          const neighbors = allBubbles.filter(b => b.active && !b.isFloating && !connected.has(b.id) && isNeighbor(curr, b));
          for (const n of neighbors) { connected.add(n.id); queue.push(n); }
      }
      return allBubbles.filter(b => b.active && !b.isFloating && !connected.has(b.id));
  };

  const completeMatch = (awarded: boolean) => {
      if (awarded && userProfile) {
        let points = 0;
        const targetColor = pendingMatches[0]?.color || 'red';
        const basePoints = COLOR_CONFIG[targetColor].points;

        // Pop Animation & Points
        pendingMatches.forEach(b => {
            b.active = false;
            b.popTime = performance.now();
            createExplosion(b.x, b.y, COLOR_CONFIG[b.color].hex);
            points += basePoints;
        });
        
        // Floating Text for main match
        if (pendingMatches.length > 0) {
            const center = pendingMatches[Math.floor(pendingMatches.length/2)];
            addFloatingText(center.x, center.y - 20, `+${points}`, '#4ade80');
        }

        playSound('pop');
        
        const floating = findFloatingBubbles(bubbles.current);
        if (floating.length > 0) {
            floating.forEach(b => {
                b.isFloating = true;
                (b as any).vx = (Math.random() - 0.5) * 6;
                (b as any).vy = -3 - Math.random() * 3;
            });
            const bonus = floating.length * basePoints * 2;
            points += bonus;
            addFloatingText(gameContainerRef.current!.clientWidth/2, gameContainerRef.current!.clientHeight/2, `AVALANCHE! +${bonus}`, '#facc15');
        }

        scoreRef.current += points + 500;
        setScore(scoreRef.current);
        
        const config = DIFFICULTY_CONFIG[userProfile.difficulty];
        if (userProfile.difficulty !== 'Infinity' && !hasWonRef.current && scoreRef.current >= config.winScore) {
            hasWonRef.current = true;
            setGameWon(true);
            setIsPaused(true);
            playSound('win');
        }
      }

      setQuizData(null);
      isQuizActiveRef.current = false;
      setPendingMatches([]);
      
      const activeCount = bubbles.current.filter(b => b.active && !b.isFloating).length;
      if (activeCount === 0 && userProfile) initGrid(canvasRef.current?.width || 1280, userProfile.difficulty);
  };
  
  const skipQuiz = () => completeMatch(true);

  const checkMatches = (startBubble: Bubble) => {
    const toCheck = [startBubble];
    const visited = new Set<string>();
    const matches: Bubble[] = [];
    while (toCheck.length > 0) {
      const current = toCheck.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      if (current.color === startBubble.color) {
        matches.push(current);
        toCheck.push(...bubbles.current.filter(b => b.active && !b.isFloating && !visited.has(b.id) && isNeighbor(current, b)));
      }
    }
    if (matches.length >= 3) {
      triggerQuiz(matches);
      return true;
    }
    return false;
  };

  // --- Touch Event Handlers for Mobile ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isQuizActiveRef.current || gameOverRef.current || isFlying.current) return;
    const touch = e.touches[0];
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Check if touching near ball or slingshot
    const distToBall = Math.sqrt(Math.pow(x - ballPos.current.x, 2) + Math.pow(y - ballPos.current.y, 2));
    const distToAnchor = Math.sqrt(Math.pow(x - anchorPos.current.x, 2) + Math.pow(y - anchorPos.current.y, 2));
    
    if (distToBall < 120 || distToAnchor < 120) { // Large hit area for mobile
        isDragging.current = true;
        isPinching.current = true; // Use existing pinch visual logic
        // Immediately snap ball to touch
        ballPos.current = { x, y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || isFlying.current) return;
    // Prevent scrolling
    // e.preventDefault(); // Note: might need to be added to listener options in useEffect

    const touch = e.touches[0];
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Constrain logic
    ballPos.current = { x, y };
    const dragDx = ballPos.current.x - anchorPos.current.x;
    const dragDy = ballPos.current.y - anchorPos.current.y;
    const dragDist = Math.sqrt(dragDx*dragDx + dragDy*dragDy);
    
    if (dragDist > MAX_DRAG_DIST) {
        const angle = Math.atan2(dragDy, dragDx);
        ballPos.current.x = anchorPos.current.x + Math.cos(angle) * MAX_DRAG_DIST;
        ballPos.current.y = anchorPos.current.y + Math.sin(angle) * MAX_DRAG_DIST;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    isPinching.current = false;
    
    const dx = anchorPos.current.x - ballPos.current.x;
    const dy = anchorPos.current.y - ballPos.current.y;
    
    if (Math.sqrt(dx*dx + dy*dy) > 30) {
        playSound('shoot');
        isFlying.current = true;
        flightStartTime.current = performance.now();
        const power = Math.min(Math.sqrt(dx*dx + dy*dy) / MAX_DRAG_DIST, 1.0);
        const mult = MIN_FORCE_MULT + (MAX_FORCE_MULT - MIN_FORCE_MULT) * (power * power);
        ballVel.current = { x: dx * mult, y: dy * mult };
    } else {
        ballPos.current = { ...anchorPos.current };
    }
  };


  // --- Rendering ---
  const drawBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colorKey: BubbleColor, isHighlighted: boolean = false, isHint: boolean = false) => {
    const config = COLOR_CONFIG[colorKey];
    const baseColor = config.hex;
    
    // Hint Glow
    if (isHint) {
        const pulse = (Math.sin(performance.now() / 150) + 1) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = baseColor; // Colored glow for vibrancy
        ctx.stroke();
        ctx.restore();
    }

    // Main Body - Vibrant Gradient
    const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
    grad.addColorStop(0, '#ffffff'); // Highlight point            
    grad.addColorStop(0.2, baseColor); // Main color start earlier for vibrancy           
    grad.addColorStop(1, adjustColor(baseColor, -40)); // Deep shadow for volume

    ctx.save();
    // Strong shadow for pop against dark background
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Sharp Highlight (Glossy Gem Look)
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.3, y - radius * 0.35, radius * 0.25, radius * 0.12, Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !gameContainerRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = gameContainerRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    anchorPos.current = { x: canvas.width / 2, y: canvas.height - SLINGSHOT_BOTTOM_OFFSET };
    ballPos.current = { ...anchorPos.current };
    
    if (userProfile && bubbles.current.length === 0) initGrid(canvas.width, userProfile.difficulty);

    let camera: any = null;
    let hands: any = null;

    const onResults = (results: any) => {
      if (isPausedRef.current || gameOverRef.current) return;
      setLoading(false);
      const now = performance.now();
      
      // Auto Drop
      if (userProfile && !isQuizActiveRef.current && !isPinching.current && !isFlying.current && !gameWon) {
          if (now - lastDropTimeRef.current > DIFFICULTY_CONFIG[userProfile.difficulty].dropInterval) addNewRow(canvas.width, canvas.height);
      }
      
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        anchorPos.current = { x: canvas.width / 2, y: canvas.height - SLINGSHOT_BOTTOM_OFFSET };
        if (!isFlying.current && !isPinching.current) ballPos.current = { ...anchorPos.current };
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Video Feed & Overlay
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      // Dark Elegant Overlay (Midnight Blue tint)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Hand Tracking Logic
      let handPos: Point | null = null;
      let pinchDist = 1.0;

      // Only check hands if NOT currently touch-dragging
      if (!isDragging.current && userProfile && !isQuizActiveRef.current && !gameOverRef.current && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const rawHandX = (landmarks[8].x * canvas.width + landmarks[4].x * canvas.width) / 2;
        const rawHandY = (landmarks[8].y * canvas.height + landmarks[4].y * canvas.height) / 2;

        // Apply Hand Smoothing (Linear Interpolation)
        if (!prevHandPos.current) {
            prevHandPos.current = { x: rawHandX, y: rawHandY };
        } else {
            prevHandPos.current.x = prevHandPos.current.x * (1 - SMOOTHING_FACTOR) + rawHandX * SMOOTHING_FACTOR;
            prevHandPos.current.y = prevHandPos.current.y * (1 - SMOOTHING_FACTOR) + rawHandY * SMOOTHING_FACTOR;
        }

        handPos = { ...prevHandPos.current };
        pinchDist = Math.sqrt(Math.pow(landmarks[8].x - landmarks[4].x, 2) + Math.pow(landmarks[8].y - landmarks[4].y, 2));

        if (window.drawConnectors && window.drawLandmarks) {
           window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {color: 'rgba(56, 189, 248, 0.6)', lineWidth: 4}); // Thicker lines
           window.drawLandmarks(ctx, landmarks, {color: 'rgba(14, 165, 233, 0.8)', lineWidth: 0, radius: 6}); // Larger points
        }
        
        // Custom Cursor
        ctx.beginPath();
        ctx.arc(handPos.x, handPos.y, 35, 0, Math.PI * 2); // Larger cursor (25 -> 35)
        ctx.strokeStyle = pinchDist < PINCH_THRESHOLD ? '#4ade80' : 'rgba(56, 189, 248, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash(pinchDist < PINCH_THRESHOLD ? [] : [4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
          // Reset smooth tracking if hand is lost
          prevHandPos.current = null;
      }
      
      // Physics Updates (Slingshot, Bubbles, Projectile) - Keeping Logic Same
      // Note: Skip hand logic if dragging via touch
      if (userProfile && !isQuizActiveRef.current && !gameOverRef.current && !isDragging.current) {
         if (handPos && pinchDist < PINCH_THRESHOLD && !isFlying.current) {
            const distToBall = Math.sqrt(Math.pow(handPos.x - ballPos.current.x, 2) + Math.pow(handPos.y - ballPos.current.y, 2));
            if (!isPinching.current && distToBall < 100) isPinching.current = true;
            if (isPinching.current) {
                ballPos.current = { x: handPos.x, y: handPos.y };
                const dragDx = ballPos.current.x - anchorPos.current.x;
                const dragDy = ballPos.current.y - anchorPos.current.y;
                const dragDist = Math.sqrt(dragDx*dragDx + dragDy*dragDy);
                if (dragDist > MAX_DRAG_DIST) {
                    const angle = Math.atan2(dragDy, dragDx);
                    ballPos.current.x = anchorPos.current.x + Math.cos(angle) * MAX_DRAG_DIST;
                    ballPos.current.y = anchorPos.current.y + Math.sin(angle) * MAX_DRAG_DIST;
                }
            }
        } else if (isPinching.current && (!handPos || pinchDist >= PINCH_THRESHOLD)) {
            isPinching.current = false;
            const dx = anchorPos.current.x - ballPos.current.x;
            const dy = anchorPos.current.y - ballPos.current.y;
            if (Math.sqrt(dx*dx + dy*dy) > 30) {
                playSound('shoot');
                isFlying.current = true;
                flightStartTime.current = performance.now();
                const power = Math.min(Math.sqrt(dx*dx + dy*dy) / MAX_DRAG_DIST, 1.0);
                const mult = MIN_FORCE_MULT + (MAX_FORCE_MULT - MIN_FORCE_MULT) * (power * power);
                ballVel.current = { x: dx * mult, y: dy * mult };
            } else { ballPos.current = { ...anchorPos.current }; }
        } else if (!isFlying.current && !isPinching.current) {
            const dx = anchorPos.current.x - ballPos.current.x;
            const dy = anchorPos.current.y - ballPos.current.y;
            ballPos.current.x += dx * 0.15; ballPos.current.y += dy * 0.15;
        }
      }

      // Physics Loop (Floating/Projectile)
      bubbles.current.forEach(b => {
          if (b.isFloating) {
              const bAny = b as any;
              bAny.vy = (bAny.vy || 0) + 0.5;
              b.x += (bAny.vx || 0); b.y += bAny.vy;
              if (b.x < BUBBLE_RADIUS || b.x > canvas.width - BUBBLE_RADIUS) { bAny.vx *= -0.6; b.x = Math.max(BUBBLE_RADIUS, Math.min(canvas.width - BUBBLE_RADIUS, b.x)); }
          }
      });
      bubbles.current = bubbles.current.filter(b => {
          if (b.active) return b.y < canvas.height + 100;
          if (b.popTime) return (now - b.popTime < POP_DURATION);
          return false;
      });

      if (isFlying.current && !isQuizActiveRef.current && !gameOverRef.current) {
         if (now - flightStartTime.current > 5000) { isFlying.current = false; ballPos.current = { ...anchorPos.current }; ballVel.current = { x: 0, y: 0 }; }
         else {
             ballVel.current.y += GRAVITY;
             const speed = Math.sqrt(ballVel.current.x**2 + ballVel.current.y**2);
             const steps = Math.ceil(speed / (BUBBLE_RADIUS * 0.5));
             let collision = false;
             for (let i = 0; i < steps; i++) {
                 ballPos.current.x += ballVel.current.x / steps; ballPos.current.y += ballVel.current.y / steps;
                 if (ballPos.current.x < BUBBLE_RADIUS || ballPos.current.x > canvas.width - BUBBLE_RADIUS) { ballVel.current.x *= -1; ballPos.current.x = Math.max(BUBBLE_RADIUS, Math.min(canvas.width - BUBBLE_RADIUS, ballPos.current.x)); playSound('bounce'); }
                 if (ballPos.current.y < BUBBLE_RADIUS) { collision = true; break; }
                 for (const b of bubbles.current) {
                     if (!b.active || b.isFloating) continue;
                     if (Math.sqrt((ballPos.current.x-b.x)**2 + (ballPos.current.y-b.y)**2) < BUBBLE_RADIUS*1.8) { collision = true; break; }
                 }
                 if (collision) break;
             }
             ballVel.current.x *= FRICTION; ballVel.current.y *= FRICTION;
             if (collision) {
                 playSound('hit');
                 isFlying.current = false;
                 // Snap logic
                 let bestDist=Infinity, bestRow=0, bestCol=0, bestX=0, bestY=0;
                 for (let r=0; r<GRID_ROWS+10; r++) {
                     const cols = r%2!==0 ? gridColsRef.current - 1 : gridColsRef.current;
                     for (let c=0; c<cols; c++) {
                         const {x,y} = getBubblePos(r,c,canvas.width);
                         if (bubbles.current.some(b=>b.active && !b.isFloating && b.row===r && b.col===c)) continue;
                         const dist = Math.sqrt((ballPos.current.x-x)**2 + (ballPos.current.y-y)**2);
                         if(dist < bestDist) { bestDist=dist; bestRow=r; bestCol=c; bestX=x; bestY=y; }
                     }
                 }
                 const newB = { id: `${bestRow}-${bestCol}-${Date.now()}`, row: bestRow, col: bestCol, x: bestX, y: bestY, color: currentAmmoRef.current, active: true };
                 bubbles.current.push(newB);
                 checkMatches(newB);
                 if (newB.y > canvas.height - SLINGSHOT_BOTTOM_OFFSET - 80) setGameOver(true);
                 // Cycle Ammo
                 const activeColors = new Set<BubbleColor>(); bubbles.current.forEach(b=>{if(b.active&&!b.isFloating)activeColors.add(b.color)});
                 const avail = Array.from(activeColors);
                 setCurrentAmmo(nextAmmoRef.current);
                 setNextAmmo(avail.length>0 ? avail[Math.floor(Math.random()*avail.length)] : 'red');
                 ballPos.current = { ...anchorPos.current }; ballVel.current = { x: 0, y: 0 };
             } else if (ballPos.current.y > canvas.height) {
                 isFlying.current = false; ballPos.current = { ...anchorPos.current }; ballVel.current = { x: 0, y: 0 };
             }
         }
      }

      // --- Draw Scene ---

      // Bubbles
      bubbles.current.forEach(b => {
          if (!b.active && b.popTime) { // Pop Animation
              const age = now - b.popTime;
              const progress = age / POP_DURATION;
              if (progress < 1) {
                  ctx.save();
                  ctx.globalAlpha = 1 - progress;
                  ctx.translate(b.x, b.y);
                  ctx.scale(1 + progress * 0.5, 1 + progress * 0.5); // Expand then fade
                  drawBubble(ctx, 0, 0, BUBBLE_RADIUS, b.color, false, false);
                  ctx.restore();
              }
              return;
          }
          if (!b.active) return;
          const isPending = pendingMatchesRef.current.some(pm => pm.id === b.id);
          const isHint = potentialMatchesRef.current.includes(b.id);
          if (b.isFloating) ctx.globalAlpha = 0.8;
          drawBubble(ctx, b.x, b.y, BUBBLE_RADIUS - 1, b.color, isPending, isHint);
          ctx.globalAlpha = 1.0;
      });

      // Connections
      if (potentialMatchesRef.current.length > 0) {
          ctx.save();
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          const pulse = (Math.sin(now / 150) + 1) / 2;
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.4})`;
          const matchBubbles = bubbles.current.filter(b => potentialMatchesRef.current.includes(b.id));
          ctx.beginPath();
          for (let i=0; i<matchBubbles.length; i++) {
              for (let j=i+1; j<matchBubbles.length; j++) {
                  if (isNeighbor(matchBubbles[i], matchBubbles[j])) { ctx.moveTo(matchBubbles[i].x, matchBubbles[i].y); ctx.lineTo(matchBubbles[j].x, matchBubbles[j].y); }
              }
          }
          ctx.stroke();
          ctx.restore();
      }

      // Danger Line
      const dangerY = canvas.height - SLINGSHOT_BOTTOM_OFFSET - 80;
      ctx.beginPath(); ctx.moveTo(0, dangerY); ctx.lineTo(canvas.width, dangerY);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);

      // Trajectory
      if (isPinching.current && !isFlying.current && userProfile) {
          const dx = anchorPos.current.x - ballPos.current.x; const dy = anchorPos.current.y - ballPos.current.y;
          const dist = Math.sqrt(dx*dx+dy*dy);
          if (dist > 10) {
              const power = Math.min(dist/MAX_DRAG_DIST, 1.0); const mult = MIN_FORCE_MULT + (MAX_FORCE_MULT-MIN_FORCE_MULT)*(power*power);
              let sx = anchorPos.current.x, sy = anchorPos.current.y, svx = dx*mult, svy = dy*mult;
              ctx.beginPath(); ctx.moveTo(sx, sy);
              for(let i=0; i<300; i++) {
                  svy += GRAVITY; sx += svx; sy += svy;
                  if (sx < BUBBLE_RADIUS || sx > canvas.width-BUBBLE_RADIUS) svx *= -1;
                  if (i%5===0) ctx.lineTo(sx, sy);
                  // Quick hit check
                  if (sy < BUBBLE_RADIUS || bubbles.current.some(b=>b.active && !b.isFloating && Math.sqrt((sx-b.x)**2+(sy-b.y)**2) < BUBBLE_RADIUS*1.8)) break;
              }
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
          }
      }

      // --- ORIGINAL VECTOR SLINGSHOT ---
      const handleWidth = 80;
      const forkSpread = 90;
      
      // Slingshot Base (Handle)
      ctx.save();
      const gradHandle = ctx.createLinearGradient(anchorPos.current.x - 20, anchorPos.current.y, anchorPos.current.x + 20, canvas.height);
      gradHandle.addColorStop(0, '#78350f'); // Wood dark
      gradHandle.addColorStop(0.5, '#b45309'); // Wood medium
      gradHandle.addColorStop(1, '#451a03'); // Wood darkest

      ctx.beginPath();
      // Draw Y shape
      ctx.moveTo(anchorPos.current.x, canvas.height);
      ctx.lineTo(anchorPos.current.x, anchorPos.current.y + 60); // Stem
      // Left Fork
      ctx.quadraticCurveTo(anchorPos.current.x, anchorPos.current.y + 20, anchorPos.current.x - forkSpread/2, anchorPos.current.y);
      ctx.lineTo(anchorPos.current.x - forkSpread/2 + 15, anchorPos.current.y + 10);
      ctx.quadraticCurveTo(anchorPos.current.x + 10, anchorPos.current.y + 40, anchorPos.current.x + 10, anchorPos.current.y + 70);
      ctx.lineTo(anchorPos.current.x + 10, canvas.height);
      // Right Fork (Mirror)
      ctx.moveTo(anchorPos.current.x, canvas.height);
      ctx.lineTo(anchorPos.current.x - 10, canvas.height);
      ctx.lineTo(anchorPos.current.x - 10, anchorPos.current.y + 70);
      ctx.quadraticCurveTo(anchorPos.current.x - 10, anchorPos.current.y + 40, anchorPos.current.x + forkSpread/2 - 15, anchorPos.current.y + 10);
      ctx.lineTo(anchorPos.current.x + forkSpread/2, anchorPos.current.y);
      ctx.quadraticCurveTo(anchorPos.current.x, anchorPos.current.y + 20, anchorPos.current.x, anchorPos.current.y + 60);
      
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 5;
      ctx.fillStyle = gradHandle;
      ctx.fill();
      ctx.strokeStyle = '#271c19';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Slingshot Bands (Elastics)
      const bandColor = isPinching.current ? '#fcd34d' : 'rgba(252, 211, 77, 0.4)';
      const leftTip = { x: anchorPos.current.x - forkSpread/2 + 5, y: anchorPos.current.y + 5 };
      const rightTip = { x: anchorPos.current.x + forkSpread/2 - 5, y: anchorPos.current.y + 5 };
      
      if (!isFlying.current) {
          ctx.save();
          ctx.beginPath();
          // Back Band
          ctx.moveTo(leftTip.x, leftTip.y);
          ctx.lineTo(ballPos.current.x - 10, ballPos.current.y);
          ctx.lineWidth = 8;
          ctx.strokeStyle = '#92400e'; // Darker part of band (shadow)
          ctx.lineCap = 'round';
          ctx.stroke();
          
          // Front Band
          ctx.beginPath();
          ctx.moveTo(rightTip.x, rightTip.y);
          ctx.lineTo(ballPos.current.x + 10, ballPos.current.y);
          ctx.strokeStyle = bandColor;
          ctx.lineWidth = 8;
          ctx.stroke();
          
          // Leather Pouch
          ctx.beginPath();
          ctx.ellipse(ballPos.current.x, ballPos.current.y, 20, 24, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#573625';
          ctx.fill();
          ctx.restore();
      }

      // Draw Ball on top of back band/pouch but behind front band logic if needed (simplified here)
      if (userProfile && !gameOverRef.current) {
          drawBubble(ctx, ballPos.current.x, ballPos.current.y, BUBBLE_RADIUS, currentAmmoRef.current);
      }

      // Redraw Left band on top if needed for depth
      if (!isFlying.current) {
         ctx.save();
         // Connect left band to ball
         ctx.beginPath();
         ctx.moveTo(leftTip.x, leftTip.y);
         ctx.lineTo(ballPos.current.x, ballPos.current.y);
         ctx.strokeStyle = bandColor;
         ctx.lineWidth = 7;
         ctx.stroke();
         ctx.restore();
      }

      // Particles (Sparkles)
      for (let i = particles.current.length - 1; i >= 0; i--) {
          const p = particles.current[i];
          p.x += p.vx; p.y += p.vy; p.life -= 0.04;
          if (p.life <= 0) particles.current.splice(i, 1);
          else {
              ctx.save();
              ctx.globalAlpha = p.life;
              ctx.translate(p.x, p.y);
              ctx.beginPath();
              for(let j=0; j<5; j++) {
                  ctx.lineTo(Math.cos((18+j*72)/180*Math.PI)*6, -Math.sin((18+j*72)/180*Math.PI)*6);
                  ctx.lineTo(Math.cos((54+j*72)/180*Math.PI)*3, -Math.sin((54+j*72)/180*Math.PI)*3);
              }
              ctx.closePath();
              ctx.fillStyle = p.color;
              ctx.fill();
              ctx.restore();
          }
      }

      // Floating Texts
      for (let i = floatingTexts.current.length - 1; i >= 0; i--) {
          const ft = floatingTexts.current[i];
          ft.y += ft.vy;
          ft.life -= 0.02;
          if (ft.life <= 0) floatingTexts.current.splice(i, 1);
          else {
              ctx.save();
              ctx.globalAlpha = ft.life;
              ctx.font = "bold 24px Outfit";
              ctx.fillStyle = ft.color;
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 4;
              ctx.textAlign = 'center';
              ctx.strokeText(ft.text, ft.x, ft.y);
              ctx.fillText(ft.text, ft.x, ft.y);
              ctx.restore();
          }
      }
      
      ctx.restore();
    };

    if (window.Hands) {
      hands = new window.Hands({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      hands.onResults(onResults);
      if (window.Camera) {
        camera = new window.Camera(video, { onFrame: async () => { if (videoRef.current && hands) await hands.send({ image: videoRef.current }); }, width: 1280, height: 720 });
        camera.start();
      }
    }
    return () => { if (camera) camera.stop(); if (hands) hands.close(); };
  }, [initGrid, userProfile]);

  // --- JSX UI (Dark Glassmorphism) ---
  return (
    <div className="flex w-full h-screen overflow-hidden font-sans text-slate-100 relative">
      
      <div className="ambient-orb" style={{top: '10%', left: '10%', background: '#4f46e5'}}></div>
      <div className="ambient-orb" style={{bottom: '20%', right: '10%', background: '#0ea5e9', animationDelay: '5s'}}></div>

      {/* REMOVED MOBILE BLOCKER */}

      <div ref={gameContainerRef} className="flex-1 relative h-full overflow-hidden">
        <video ref={videoRef} className="absolute hidden" playsInline />
        {/* ADDED TOUCH HANDLERS TO CANVAS */}
        <canvas 
            ref={canvasRef} 
            className="absolute inset-0 touch-none" 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        />

        {/* Loading */}
        {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-md z-50">
                <Loader2 className="w-12 h-12 text-sky-400 animate-spin" />
            </div>
        )}

        {/* REGISTRATION FORM - Dark Glass Card */}
        {!userProfile && !loading && (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-slate-900/60 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl max-w-md w-full animate-in zoom-in duration-500">
                    <div className="text-center mb-8">
                        <div className="inline-flex bg-white/10 p-4 rounded-full mb-4 shadow-inner ring-1 ring-white/20">
                            <GraduationCap className="w-8 h-8 text-sky-400" />
                        </div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">English Master</h1>
                        <p className="text-slate-400 mt-2">Level up your language skills</p>
                    </div>
                    
                    <div className="space-y-5">
                        <div className="group">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Name</label>
                            <input 
                                type="text" 
                                className="w-full bg-black/30 border-0 ring-1 ring-white/10 rounded-2xl py-3 px-5 text-white focus:ring-2 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600"
                                value={formInput.name}
                                onChange={(e) => setFormInput({...formInput, name: e.target.value})}
                                placeholder="Enter your name"
                            />
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Class</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-black/30 border-0 ring-1 ring-white/10 rounded-2xl py-3 px-5 text-white focus:ring-2 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600"
                                    value={formInput.className}
                                    onChange={(e) => setFormInput({...formInput, className: e.target.value})}
                                    placeholder="e.g. 7A"
                                />
                            </div>
                             <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Difficulty</label>
                                <select 
                                    className="w-full bg-black/30 border-0 ring-1 ring-white/10 rounded-2xl py-3 px-5 text-white focus:ring-2 focus:ring-sky-500 outline-none transition-all cursor-pointer appearance-none"
                                    value={formInput.difficulty}
                                    onChange={(e) => setFormInput({...formInput, difficulty: e.target.value as Difficulty})}
                                >
                                    <option value="Easy" className="bg-slate-800">Easy</option>
                                    <option value="Medium" className="bg-slate-800">Medium</option>
                                    <option value="Hard" className="bg-slate-800">Hard</option>
                                    <option value="Infinity" className="bg-slate-800">Infinity</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <label className="block text-xs font-bold text-sky-400 uppercase tracking-wider ml-1">What do you want to learn?</label>
                                <button 
                                    onClick={() => setShowQuestionBuilder(true)}
                                    className="text-[10px] flex items-center gap-1 bg-amber-500/20 text-amber-300 px-2 py-1 rounded-full hover:bg-amber-500/30 transition-colors border border-amber-500/30"
                                >
                                    <Edit3 className="w-3 h-3" /> Teacher Mode
                                </button>
                            </div>
                            
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <PenTool className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="text" 
                                        className="w-full bg-black/30 border-0 ring-1 ring-white/10 rounded-2xl py-3 pl-11 pr-5 text-white focus:ring-2 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-500"
                                        value={formInput.topic}
                                        onChange={(e) => setFormInput({...formInput, topic: e.target.value})}
                                        placeholder="Type a topic (e.g., Harry Potter)..."
                                        disabled={(formInput.customQuestions?.length || 0) > 0}
                                    />
                                </div>
                                <button 
                                    onClick={handleRandomizeTopic}
                                    disabled={isRandomizing || (formInput.customQuestions?.length || 0) > 0}
                                    className={`bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl px-4 flex items-center justify-center transition-all ${isRandomizing ? 'scale-95 opacity-80' : 'hover:scale-105 active:scale-95'} shadow-lg shadow-indigo-900/40 disabled:opacity-50`}
                                    title="Random Topic"
                                >
                                    {isRandomizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shuffle className="w-5 h-5" />}
                                </button>
                            </div>

                            {/* Logic to show message if custom questions are loaded */}
                            {(formInput.customQuestions?.length || 0) > 0 ? (
                                <div className="mt-3 flex items-center gap-2 text-amber-300 text-xs bg-amber-900/20 p-2 rounded-lg border border-amber-500/20">
                                    <FileText className="w-4 h-4" />
                                    <span>Using {formInput.customQuestions?.length} custom teacher questions!</span>
                                    <button 
                                        onClick={() => setFormInput({...formInput, customQuestions: []})}
                                        className="ml-auto hover:text-white"
                                    >
                                        <XCircle className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                /* Suggestions Chips */
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="text-[10px] uppercase font-bold text-slate-500 w-full mb-1">Suggestions:</span>
                                    {ENGLISH_TOPICS.slice(0, 8).map(topic => (
                                        <button 
                                            key={topic}
                                            onClick={() => setFormInput({...formInput, topic})}
                                            className="text-xs bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 px-3 py-1.5 rounded-full transition-colors truncate max-w-[150px]"
                                            title={topic}
                                        >
                                            {topic}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={() => {
                                if(formInput.name && formInput.className && (formInput.topic || (formInput.customQuestions?.length || 0) > 0)) {
                                    audioCtx.resume();
                                    setUserProfile(formInput);
                                    initGrid(canvasRef.current?.width || 1280, formInput.difficulty);
                                }
                            }}
                            disabled={!formInput.name || !formInput.className || (!formInput.topic && (formInput.customQuestions?.length || 0) === 0)}
                            className="w-full mt-6 bg-sky-600 hover:bg-sky-500 text-white font-bold py-4 rounded-2xl transition-all hover:scale-[1.02] shadow-lg shadow-sky-900/50 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            Start Mission
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* TEACHER MODE / QUESTION BUILDER OVERLAY */}
        {showQuestionBuilder && (
            <div className="absolute inset-0 z-[70] bg-black/80 backdrop-blur-lg flex items-center justify-center p-4">
                <div className="bg-slate-900 rounded-[2rem] border border-amber-500/30 w-full max-w-2xl h-[85vh] flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-300">
                    {/* Header */}
                    <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5 rounded-t-[2rem]">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-500/20 p-2 rounded-xl text-amber-400">
                                <Edit3 className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Teacher Mode</h2>
                                <p className="text-slate-400 text-xs">Create custom questions for your students</p>
                            </div>
                        </div>
                        <button onClick={() => setShowQuestionBuilder(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <XCircle className="w-6 h-6 text-slate-400" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Input Area */}
                        <div className="bg-black/30 p-5 rounded-2xl border border-white/5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Question</label>
                                <input 
                                    type="text" 
                                    value={tempQuestion.q}
                                    onChange={(e) => setTempQuestion({...tempQuestion, q: e.target.value})}
                                    className="w-full bg-slate-800 border-0 ring-1 ring-white/10 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                    placeholder="e.g. What is the past tense of 'go'?"
                                />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Answer</label>
                                    <input 
                                        type="text" 
                                        value={tempQuestion.a}
                                        onChange={(e) => setTempQuestion({...tempQuestion, a: e.target.value})}
                                        className="w-full bg-slate-800 border-0 ring-1 ring-white/10 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                        placeholder="e.g. Went"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Explanation (Optional)</label>
                                    <input 
                                        type="text" 
                                        value={tempQuestion.e}
                                        onChange={(e) => setTempQuestion({...tempQuestion, e: e.target.value})}
                                        className="w-full bg-slate-800 border-0 ring-1 ring-white/10 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                        placeholder="Brief explanation..."
                                    />
                                </div>
                            </div>
                            <button 
                                onClick={handleAddCustomQuestion}
                                disabled={!tempQuestion.q || !tempQuestion.a}
                                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-5 h-5" /> Add Question
                            </button>
                        </div>

                        {/* List Area */}
                        <div>
                             <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center justify-between">
                                 <span>Created Questions</span>
                                 <span className="bg-white/10 px-2 py-0.5 rounded text-xs text-white">{(formInput.customQuestions || []).length}</span>
                             </h3>
                             
                             <div className="space-y-3">
                                 {(formInput.customQuestions || []).length === 0 ? (
                                     <div className="text-center py-8 text-slate-500 border border-dashed border-white/10 rounded-xl">
                                         No questions added yet.
                                     </div>
                                 ) : (
                                     (formInput.customQuestions || []).map((q, idx) => (
                                         <div key={idx} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-center group hover:bg-white/10 transition-colors">
                                             <div className="flex-1 mr-4">
                                                 <p className="font-bold text-slate-200 text-sm">{q.question}</p>
                                                 <p className="text-green-400 text-xs mt-1">Ans: {q.answer}</p>
                                             </div>
                                             <button onClick={() => removeCustomQuestion(idx)} className="text-slate-500 hover:text-red-400 p-2">
                                                 <Trash2 className="w-4 h-4" />
                                             </button>
                                         </div>
                                     ))
                                 )}
                             </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/10 bg-black/20 rounded-b-[2rem]">
                        <button 
                            onClick={() => setShowQuestionBuilder(false)}
                            className="w-full bg-white text-black font-bold py-4 rounded-xl hover:bg-slate-200 transition-colors"
                        >
                            Done & Save
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* QUIZ OVERLAY - Dark Luxurious Pop-up */}
        {(quizLoading || quizData) && (
            <div className="absolute inset-0 z-[90] bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-slate-900/90 backdrop-blur-xl w-full max-w-lg rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                    <div className="bg-white/5 p-8 border-b border-white/5 flex items-center gap-5">
                        <div className="bg-white/10 p-3 rounded-2xl shadow-inner ring-1 ring-white/10">
                            <BrainCircuit className="w-8 h-8 text-sky-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">English Challenge</h2>
                            <p className="text-sky-400 font-medium">Solve to pop the cluster!</p>
                        </div>
                    </div>

                    <div className="p-8">
                        {quizLoading ? (
                            <div className="py-10 flex flex-col items-center">
                                <Loader2 className="w-10 h-10 text-sky-400 animate-spin mb-3" />
                                <p className="text-slate-400 font-medium">Generating Question...</p>
                            </div>
                        ) : quizData ? (
                            <div className="space-y-6">
                                <div className="bg-black/30 p-6 rounded-2xl border border-white/5 shadow-inner">
                                    <p className="text-xl text-slate-200 font-medium leading-relaxed text-center">{quizData.question}</p>
                                    {quizData.type === 'custom' && (
                                        <div className="mt-2 flex justify-center">
                                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/20 uppercase tracking-widest">Teacher's Question</span>
                                        </div>
                                    )}
                                </div>

                                {!quizResult && (
                                    <form onSubmit={handleQuizSubmit} className="space-y-4">
                                        <input
                                            type="text"
                                            autoFocus
                                            value={quizAnswer}
                                            onChange={(e) => setQuizAnswer(e.target.value)}
                                            className="w-full bg-black/20 border-0 ring-1 ring-white/20 rounded-2xl py-4 px-6 text-lg text-white focus:ring-2 focus:ring-sky-500 outline-none text-center transition-all placeholder:text-slate-600"
                                            placeholder="Type answer..."
                                        />
                                        <button
                                            type="submit"
                                            className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-4 rounded-2xl transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-sky-900/50"
                                        >
                                            Submit Answer
                                        </button>
                                    </form>
                                )}

                                {quizResult && (
                                    <div className={`p-6 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 ${quizResult === 'correct' ? 'bg-green-900/30 border border-green-500/30 text-green-300' : 'bg-red-900/30 border border-red-500/30 text-red-300'}`}>
                                        {quizResult === 'correct' ? <CheckCircle2 className="w-8 h-8 shrink-0" /> : <XCircle className="w-8 h-8 shrink-0" />}
                                        <div>
                                            <h3 className="font-bold text-lg">{quizResult === 'correct' ? 'Brilliant!' : 'Not quite.'}</h3>
                                            {quizResult === 'incorrect' && <p className="text-sm mt-1 text-slate-300">Answer: <b>{quizData.answer}</b></p>}
                                            {quizData.explanation && <p className="text-xs mt-2 text-slate-400 italic">{quizData.explanation}</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                    
                    {!quizLoading && (
                        <div className="bg-black/20 p-4 flex justify-center">
                             <button onClick={skipQuiz} className="text-slate-500 hover:text-slate-300 text-sm font-bold uppercase tracking-widest transition-colors">Skip Question</button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* HUD: Modern Dark Glass Pills */}
        {userProfile && (
            <>
                <div className="absolute top-8 left-8 z-40 flex flex-col gap-3 animate-in slide-in-from-left-6">
                    <div className="bg-slate-900/60 backdrop-blur-md p-2 pr-6 rounded-full border border-white/10 shadow-lg flex items-center gap-4">
                        <div className="bg-white/10 p-3 rounded-full">
                            <Trophy className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Score</p>
                            <p className="text-2xl font-bold text-white leading-none">{score.toLocaleString()}</p>
                        </div>
                    </div>
                    
                    {userProfile.difficulty !== 'Infinity' && (
                        <div className="bg-slate-900/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 w-48 shadow-lg">
                             <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-sky-400 to-purple-500 transition-all duration-700" style={{ width: `${Math.min(100, (score / DIFFICULTY_CONFIG[userProfile.difficulty].winScore) * 100)}%` }} />
                             </div>
                        </div>
                    )}
                </div>

                <div className="absolute top-8 right-8 z-50 flex gap-3 animate-in slide-in-from-right-6">
                    <button onClick={saveToLeaderboard} className="bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-md p-4 rounded-full border border-white/10 shadow-lg transition-all hover:scale-105 group">
                        <Save className="w-5 h-5 text-slate-400 group-hover:text-amber-400" />
                    </button>
                    <button onClick={() => setIsPaused(!isPaused)} className="bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-md p-4 rounded-full border border-white/10 shadow-lg transition-all hover:scale-105 group">
                        {isPaused ? <Play className="w-5 h-5 text-green-400" /> : <Pause className="w-5 h-5 text-slate-400 group-hover:text-sky-400" />}
                    </button>
                </div>

                {/* Ammo HUD */}
                {!gameOver && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
                        <div className="bg-slate-900/60 backdrop-blur-xl px-8 py-3 rounded-full border border-white/10 shadow-2xl flex items-center gap-6">
                            <div className="relative">
                                <div className="w-12 h-12 rounded-full shadow-lg ring-2 ring-white/30" style={{ background: COLOR_CONFIG[currentAmmo].hex }} />
                                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Load</div>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div className="relative opacity-60 scale-75">
                                <div className="w-12 h-12 rounded-full shadow-inner ring-1 ring-white/10" style={{ background: COLOR_CONFIG[nextAmmo].hex }} />
                                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Next</div>
                            </div>
                        </div>
                    </div>
                )}
            </>
        )}

        {/* PAUSE */}
        {isPaused && !showLeaderboard && !gameWon && (
            <div className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-md flex items-center justify-center">
                <div className="bg-slate-900/80 backdrop-blur-xl p-10 rounded-[3rem] shadow-2xl border border-white/10 flex flex-col items-center">
                    <h2 className="text-4xl font-extrabold text-white mb-8 tracking-tight">Paused</h2>
                    <button onClick={() => setIsPaused(false)} className="bg-sky-600 text-white px-10 py-4 rounded-full font-bold shadow-lg hover:bg-sky-500 hover:scale-105 transition-all">Resume</button>
                </div>
            </div>
        )}

        {/* VICTORY */}
        {gameWon && (
             <div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-lg flex items-center justify-center">
                 <div className="bg-slate-900/90 backdrop-blur-xl p-10 rounded-[3rem] border border-amber-500/30 shadow-2xl flex flex-col items-center text-center max-w-sm animate-in zoom-in duration-500">
                    <div className="bg-amber-900/30 p-6 rounded-full mb-6 ring-1 ring-amber-500/50">
                        <Crown className="w-12 h-12 text-amber-400" />
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-2">Victory!</h2>
                    <p className="text-slate-400 mb-8">English Mastered.</p>
                    <button onClick={() => { setGameWon(false); setIsPaused(false); }} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-4 rounded-2xl shadow-lg shadow-amber-900/50 transition-all hover:scale-[1.02] mb-3">Keep Playing</button>
                    <div className="flex gap-3 w-full">
                        <button onClick={saveToLeaderboard} className="flex-1 bg-white/5 border border-white/10 text-slate-300 font-bold py-3 rounded-xl hover:bg-white/10">Save</button>
                        <button onClick={() => { if(userProfile) initGrid(canvasRef.current?.width || 1280, userProfile.difficulty); setScore(0); scoreRef.current = 0; }} className="flex-1 bg-sky-900/30 border border-sky-500/30 text-sky-400 font-bold py-3 rounded-xl hover:bg-sky-900/50">Restart</button>
                    </div>
                </div>
            </div>
        )}

        {/* LEADERBOARD */}
        {showLeaderboard && (
             <div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-lg flex items-center justify-center">
                 <div className="bg-slate-900/95 backdrop-blur-xl w-full max-w-xl h-[70vh] rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8">
                    <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Medal className="text-amber-400" /> Top Scholars</h2>
                        <button onClick={() => { setShowLeaderboard(false); setIsPaused(false); if(gameOver && userProfile){ initGrid(canvasRef.current?.width||1280, userProfile.difficulty); setScore(0); scoreRef.current=0;}}} className="p-2 bg-white/5 rounded-full hover:bg-white/10"><XCircle className="w-6 h-6 text-slate-400" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {leaderboard.length === 0 ? <p className="text-center text-slate-500 py-10">No records yet.</p> : leaderboard.map((e, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 shadow-sm hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-4">
                                    <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${i<3 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700/50 text-slate-400'}`}>{i+1}</span>
                                    <div><p className="font-bold text-slate-200">{e.name}</p><p className="text-xs text-slate-500">{e.className}</p></div>
                                </div>
                                <span className="font-mono font-bold text-sky-400">{e.score.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                 </div>
             </div>
        )}
      </div>
    </div>
  );
};

export default GeminiSlingshot;