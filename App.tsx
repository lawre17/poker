import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameScreen } from './src/ui/GameScreen';
import { HomeScreen } from './src/ui/HomeScreen';
import { SplashScreen } from './src/ui/SplashScreen';
import { useGame } from './src/ui/useGame';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const {
    state,
    feedback,
    newGame,
    exitToMenu,
    playCard,
    playSequence,
    draw,
    skipTurn,
    announceKadi,
  } = useGame();

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {showSplash ? (
        <SplashScreen onDone={() => setShowSplash(false)} />
      ) : state ? (
        <GameScreen
          state={state}
          feedback={feedback}
          onPlay={playCard}
          onPlaySequence={playSequence}
          onDraw={draw}
          onSkipTurn={skipTurn}
          onAnnounceKadi={announceKadi}
          onExit={exitToMenu}
        />
      ) : (
        <HomeScreen onStart={newGame} />
      )}
    </SafeAreaProvider>
  );
}
