/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Terminal, Cpu } from 'lucide-react';

// --- CONSTANTS ---
const GRID_SIZE = 20;
const GAME_SPEED = 100; // ms per move

const AUDIO_TRACKS = [
  { id: 'trk-01', title: 'SECTOR_7_AMBIENCE.WAV', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', duration: '6:12' },
  { id: 'trk-02', title: 'CYBERNETIC_PULSE.MP3', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', duration: '7:05' },
  { id: 'trk-03', title: 'VOID_RESONANCE.FLAC', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', duration: '5:44' }
];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export default function App() {
  // --- REACT STATE ---
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // --- REFS ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const audioRef = useRef<HTMLAudioElement>(null);

  // --- MUTABLE GAME STATE (For requestAnimationFrame) ---
  const gameState = useRef({
    snake: [{x: 10, y: 10}, {x: 10, y: 11}, {x: 10, y: 12}],
    dir: {x: 0, y: -1},
    nextDir: {x: 0, y: -1},
    food: {x: 5, y: 5},
    particles: [] as Particle[],
    score: 0,
    gameOver: false,
    isRunning: false,
    lastMove: 0,
    shake: 0
  });

  // --- AUDIO LOGIC ---
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [isPlaying, currentTrackIdx]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const nextTrack = () => { setCurrentTrackIdx(p => (p + 1) % AUDIO_TRACKS.length); setIsPlaying(true); };
  const prevTrack = () => { setCurrentTrackIdx(p => (p - 1 + AUDIO_TRACKS.length) % AUDIO_TRACKS.length); setIsPlaying(true); };

  // --- GAME ENGINE ---
  const spawnFood = () => {
    const state = gameState.current;
    let newFood;
    while (true) {
      newFood = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
      // eslint-disable-next-line no-loop-func
      if (!state.snake.some(s => s.x === newFood.x && s.y === newFood.y)) break;
    }
    state.food = newFood;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = gameState.current;
    const w = canvas.width;
    const h = canvas.height;
    const cs = w / GRID_SIZE;

    // Clear
    ctx.fillStyle = '#020202';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    
    // Screen Shake
    if (state.shake > 0) {
      const dx = (Math.random() - 0.5) * state.shake;
      const dy = (Math.random() - 0.5) * state.shake;
      ctx.translate(dx, dy);
    }

    // Grid lines (subtle)
    ctx.strokeStyle = '#00ffff';
    ctx.globalAlpha = 0.05;
    ctx.lineWidth = 1;
    for(let i=0; i<=w; i+=cs) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Draw Food
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff00ff';
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(state.food.x * cs + 2, state.food.y * cs + 2, cs - 4, cs - 4);

    // Draw Snake
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ffff';
    state.snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#ffffff' : '#00ffff';
      ctx.fillRect(seg.x * cs + 1, seg.y * cs + 1, cs - 2, cs - 2);
    });

    // Draw Particles
    ctx.shadowBlur = 8;
    state.particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    });
    ctx.globalAlpha = 1.0;

    ctx.restore();
  }, []);

  const update = useCallback((time: number) => {
    const state = gameState.current;
    if (!state.isRunning) {
      draw();
      if (state.particles.length > 0 || state.shake > 0) {
        // Continue animating particles/shake even if dead
        state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.03; });
        state.particles = state.particles.filter(p => p.life > 0);
        if (state.shake > 0) state.shake *= 0.8;
        if (state.shake < 0.5) state.shake = 0;
        requestRef.current = requestAnimationFrame(update);
      }
      return;
    }

    if (time - state.lastMove > GAME_SPEED) {
      state.lastMove = time;
      state.dir = state.nextDir;
      const head = state.snake[0];
      const newHead = { x: head.x + state.dir.x, y: head.y + state.dir.y };

      // Wall Collision
      if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
        triggerDeath();
        return;
      }
      
      // Self Collision
      if (state.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
        triggerDeath();
        return;
      }

      state.snake.unshift(newHead);

      // Food Collision
      if (newHead.x === state.food.x && newHead.y === state.food.y) {
        state.score += 10;
        setScore(state.score);
        state.shake = 8; // Juice: small shake
        
        // Juice: spawn particles
        const cs = canvasRef.current!.width / GRID_SIZE;
        for(let i=0; i<20; i++) {
          state.particles.push({
            x: state.food.x * cs + cs/2,
            y: state.food.y * cs + cs/2,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12,
            life: 1.0,
            color: Math.random() > 0.5 ? '#ff00ff' : '#00ffff'
          });
        }
        spawnFood();
      } else {
        state.snake.pop();
      }
    }

    // Update Particles & Shake
    state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.04; });
    state.particles = state.particles.filter(p => p.life > 0);
    if (state.shake > 0) state.shake *= 0.9;
    if (state.shake < 0.5) state.shake = 0;

    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [draw]);

  const triggerDeath = () => {
    const state = gameState.current;
    state.gameOver = true;
    state.isRunning = false;
    state.shake = 25; // Juice: big shake on death
    setGameOver(true);
    setIsRunning(false);
    
    // Juice: explosion particles at head
    const head = state.snake[0];
    const cs = canvasRef.current!.width / GRID_SIZE;
    for(let i=0; i<40; i++) {
      state.particles.push({
        x: head.x * cs + cs/2,
        y: head.y * cs + cs/2,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 1.5,
        color: '#ff0000'
      });
    }
    requestRef.current = requestAnimationFrame(update); // keep animating death
  };

  const initGame = () => {
    gameState.current = {
      snake: [{x: 10, y: 10}, {x: 10, y: 11}, {x: 10, y: 12}],
      dir: {x: 0, y: -1},
      nextDir: {x: 0, y: -1},
      food: {x: 5, y: 5},
      particles: [],
      score: 0,
      gameOver: false,
      isRunning: true,
      lastMove: performance.now(),
      shake: 0
    };
    setScore(0);
    setGameOver(false);
    setIsRunning(true);
    spawnFood();
    
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = requestAnimationFrame(update);
  };

  // --- INPUT HANDLING ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = gameState.current;
      if (!state.isRunning) return;
      
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }

      const { x, y } = state.dir;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': if (y !== 1) state.nextDir = { x: 0, y: -1 }; break;
        case 'ArrowDown': case 's': case 'S': if (y !== -1) state.nextDir = { x: 0, y: 1 }; break;
        case 'ArrowLeft': case 'a': case 'A': if (x !== 1) state.nextDir = { x: -1, y: 0 }; break;
        case 'ArrowRight': case 'd': case 'D': if (x !== -1) state.nextDir = { x: 1, y: 0 }; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initial draw
  useEffect(() => {
    draw();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [draw]);

  return (
    <div className="min-h-screen bg-[#020202] text-[#00ffff] font-mono p-4 md:p-8 flex flex-col items-center justify-center crt-flicker screen-tear relative overflow-hidden">
      <div className="static-noise"></div>
      <div className="scanlines"></div>
      
      {/* HEADER */}
      <header className="w-full max-w-5xl mb-8 flex justify-between items-end border-b-4 border-[#ff00ff] pb-4 relative z-10">
        <div className="glitch-wrapper">
          <h1 className="text-4xl md:text-6xl font-bold tracking-widest glitch" data-text="NEURAL_SERPENT">
            <span>NEURAL_SERPENT</span>
            NEURAL_SERPENT
            <span>NEURAL_SERPENT</span>
          </h1>
          <p className="text-[#ff00ff] text-sm mt-1 tracking-widest flex items-center gap-2">
            <Cpu size={16} /> PROTOCOL_V.9.9.9 // LINK_ESTABLISHED
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl neon-text-cyan">DATA_HARVESTED: {score.toString().padStart(4, '0')}</div>
          <div className="text-sm text-[#ff00ff] mt-1">
            SYS_STATE: {gameOver ? 'SYNAPTIC_SEVERANCE' : isRunning ? 'EXECUTING' : 'AWAITING_INPUT'}
          </div>
        </div>
      </header>

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        
        {/* LEFT PANEL: AUDIO PLAYER */}
        <aside className="lg:col-span-1 flex flex-col gap-6">
          <div className="neon-border-magenta p-6 bg-[#050505]/90 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#ff00ff] opacity-70"></div>
            <h2 className="text-xl mb-4 flex items-center gap-2 text-[#ff00ff] font-bold">
              <Terminal size={20} />
              AUDITORY_CORTEX
            </h2>
            
            <div className="mb-6 border-2 border-[#00ffff]/40 p-4 bg-[#00ffff]/10 relative">
              <div className="absolute -top-3 left-2 bg-[#020202] px-2 text-xs text-[#00ffff]">DECRYPTING_STREAM</div>
              <div className="text-xl truncate neon-text-cyan animate-pulse mt-2">
                &gt; {AUDIO_TRACKS[currentTrackIdx].title}
              </div>
              <div className="text-sm text-[#ff00ff] mt-3 flex justify-between font-bold">
                <span>0:00</span>
                <span>{AUDIO_TRACKS[currentTrackIdx].duration}</span>
              </div>
              <div className="w-full h-2 bg-[#020202] mt-2 border border-[#00ffff]/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 h-full bg-[#00ffff] w-1/3 animate-[pulse_1.5s_ease-in-out_infinite]"></div>
              </div>
            </div>

            <div className="flex justify-between items-center mb-6">
              <button onClick={prevTrack} className="p-3 hover:bg-[#ff00ff]/20 text-[#ff00ff] transition-colors border-2 border-transparent hover:border-[#ff00ff]">
                <SkipBack size={28} />
              </button>
              <button onClick={togglePlay} className="p-5 bg-[#00ffff]/20 hover:bg-[#00ffff]/40 text-[#00ffff] border-2 border-[#00ffff] transition-colors shadow-[0_0_15px_rgba(0,255,255,0.5)]">
                {isPlaying ? <Pause size={36} /> : <Play size={36} />}
              </button>
              <button onClick={nextTrack} className="p-3 hover:bg-[#ff00ff]/20 text-[#ff00ff] transition-colors border-2 border-transparent hover:border-[#ff00ff]">
                <SkipForward size={28} />
              </button>
            </div>

            <div className="flex items-center justify-between text-sm border-t-2 border-[#ff00ff]/30 pt-4">
              <button onClick={() => setIsMuted(!isMuted)} className="flex items-center gap-2 hover:text-white transition-colors font-bold">
                {isMuted ? <VolumeX size={18} className="text-[#ff0000]" /> : <Volume2 size={18} />}
                {isMuted ? 'AUDIO_MUTED' : 'AUDIO_ACTIVE'}
              </button>
              <span className="text-xs text-[#ff00ff] animate-pulse">AI_SYNTHESIS</span>
            </div>

            <audio ref={audioRef} src={AUDIO_TRACKS[currentTrackIdx].url} onEnded={nextTrack} className="hidden" />
          </div>

          {/* TRACK LIST */}
          <div className="neon-border-cyan p-4 bg-[#050505]/90 backdrop-blur-md">
            <h3 className="text-sm text-[#00ffff] mb-3 border-b-2 border-[#00ffff]/30 pb-2 font-bold">AVAILABLE_DATA_STREAMS</h3>
            <ul className="space-y-2">
              {AUDIO_TRACKS.map((track, idx) => (
                <li 
                  key={track.id}
                  onClick={() => { setCurrentTrackIdx(idx); setIsPlaying(true); }}
                  className={`text-sm cursor-pointer p-3 flex justify-between items-center border-l-4 transition-all ${idx === currentTrackIdx ? 'border-[#00ffff] bg-[#00ffff]/20 text-[#00ffff] font-bold shadow-[inset_0_0_10px_rgba(0,255,255,0.2)]' : 'border-transparent text-gray-400 hover:text-[#00ffff] hover:bg-[#00ffff]/5'}`}
                >
                  <span className="truncate pr-2">[{idx + 1}] {track.title}</span>
                  <span className="text-xs opacity-70">{track.duration}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* CENTER PANEL: GAME AREA */}
        <section className="lg:col-span-2 flex flex-col items-center justify-center">
          <div className="relative group">
            {/* CANVAS CONTAINER */}
            <canvas 
              ref={canvasRef}
              width={400}
              height={400}
              className={`w-full max-w-[500px] aspect-square bg-[#020202] transition-all duration-75 ${gameOver ? 'neon-border-magenta' : 'neon-border-cyan'}`}
              style={{
                boxShadow: gameOver ? '0 0 30px #ff00ff, inset 0 0 30px #ff00ff' : '0 0 20px #00ffff, inset 0 0 20px #00ffff',
                borderColor: gameOver ? '#ff00ff' : '#00ffff'
              }}
            />

            {/* OVERLAYS */}
            {!isRunning && !gameOver && (
              <div className="absolute inset-0 bg-[#020202]/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm border-2 border-[#00ffff]">
                <div className="text-[#00ffff] text-3xl mb-6 animate-pulse tracking-widest font-bold text-center">
                  [ LINK_STANDBY ]
                </div>
                <button 
                  onClick={initGame}
                  className="px-8 py-4 border-2 border-[#ff00ff] text-[#ff00ff] hover:bg-[#ff00ff] hover:text-[#020202] transition-all font-bold tracking-widest text-xl shadow-[0_0_15px_#ff00ff]"
                >
                  INITIALIZE_LINK
                </button>
                <div className="mt-8 text-sm text-[#00ffff]/70 flex gap-6 font-bold">
                  <span>INPUT: [W][A][S][D]</span>
                  <span>ALT: [ARROWS]</span>
                </div>
              </div>
            )}

            {gameOver && (
              <div className="absolute inset-0 bg-[#ff00ff]/20 flex flex-col items-center justify-center z-20 backdrop-blur-md border-4 border-[#ff00ff]">
                <div className="glitch-wrapper mb-6">
                  <div className="text-[#ff00ff] text-5xl font-bold glitch text-center" data-text="SYNAPTIC_SEVERANCE">
                    <span>SYNAPTIC_SEVERANCE</span>
                    SYNAPTIC_SEVERANCE
                    <span>SYNAPTIC_SEVERANCE</span>
                  </div>
                </div>
                <div className="text-[#00ffff] text-2xl mb-8 font-bold bg-[#020202] px-4 py-2 border border-[#00ffff]">
                  DATA_LOST // SCORE: {score}
                </div>
                <button 
                  onClick={initGame}
                  className="px-8 py-4 border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-[#020202] transition-all font-bold tracking-widest text-xl shadow-[0_0_20px_#00ffff]"
                >
                  REESTABLISH_CONNECTION
                </button>
              </div>
            )}
          </div>
          
          <div className="mt-8 text-center text-sm text-[#ff00ff] max-w-lg border border-[#ff00ff]/30 p-4 bg-[#ff00ff]/5">
            <span className="font-bold animate-pulse">WARNING:</span> PROLONGED EXPOSURE TO NEURAL INTERFACE MAY CAUSE SYNAPTIC DEGRADATION. OPERATE AT YOUR OWN RISK.
          </div>
        </section>

      </main>
    </div>
  );
}
