import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ActiveMatch,
  clearActiveMatch,
  getActiveMatch,
  setActiveMatch,
} from './src/api/activeMatch';
import { AuthProvider, useAuth } from './src/api/auth';
import { GameScreen } from './src/ui/GameScreen';
import { HomeScreen } from './src/ui/HomeScreen';
import { LobbyScreen, OnlineMatch } from './src/ui/LobbyScreen';
import { LoginScreen } from './src/ui/LoginScreen';
import { OnlineGameScreen } from './src/ui/OnlineGameScreen';
import { RegisterScreen } from './src/ui/RegisterScreen';
import { SplashScreen } from './src/ui/SplashScreen';
import { colors } from './src/ui/theme';
import { useGame } from './src/ui/useGame';

const queryClient = new QueryClient();

type Route =
  | { name: 'home' }
  | { name: 'lobby' }
  | { name: 'online'; match: OnlineMatch };

function AppContent() {
  const { token, loading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [route, setRoute] = useState<Route>({ name: 'home' });
  // A game the player is mid-way through (persisted), offered as "Rejoin".
  const [resume, setResume] = useState<ActiveMatch | null>(null);

  useEffect(() => {
    if (!token) {
      setResume(null);
      return;
    }
    void getActiveMatch().then(setResume);
  }, [token]);

  const enterGame = (match: OnlineMatch) => {
    void setActiveMatch({ matchId: match.matchId, roster: match.roster });
    setResume({ matchId: match.matchId, roster: match.roster });
    setRoute({ name: 'online', match });
  };

  const leaveGame = () => {
    void clearActiveMatch();
    setResume(null);
    setRoute({ name: 'home' });
  };

  // Offline AI game (unchanged).
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

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.felt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  // Not signed in → auth screens.
  if (!token) {
    return authMode === 'login' ? (
      <LoginScreen onSwitchToRegister={() => setAuthMode('register')} />
    ) : (
      <RegisterScreen onSwitchToLogin={() => setAuthMode('login')} />
    );
  }

  // Offline AI game takes over the screen while a local game is in progress.
  if (state) {
    return (
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
    );
  }

  // Online game.
  if (route.name === 'online') {
    return (
      <OnlineGameScreen
        matchId={route.match.matchId}
        roster={route.match.roster}
        onExit={leaveGame}
      />
    );
  }

  // Lobby.
  if (route.name === 'lobby') {
    return (
      <LobbyScreen
        onExit={() => setRoute({ name: 'home' })}
        onEnterGame={enterGame}
      />
    );
  }

  // Home.
  return (
    <HomeScreen
      onStart={newGame}
      onPlayOnline={() => setRoute({ name: 'lobby' })}
      resumeMatch={resume}
      onResume={() => resume && setRoute({ name: 'online', match: resume })}
      onForgetResume={leaveGame}
    />
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SafeAreaProvider>
          <StatusBar style="light" />
          {showSplash ? (
            <SplashScreen onDone={() => setShowSplash(false)} />
          ) : (
            <AppContent />
          )}
        </SafeAreaProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
