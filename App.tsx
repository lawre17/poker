import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ActiveMatch,
  clearActiveMatch,
  getActiveMatch,
  setActiveMatch,
} from './src/api/activeMatch';
import {
  ActiveTournament,
  clearActiveTournament,
  getActiveTournament,
  setActiveTournament,
} from './src/api/activeTournament';
import { AuthProvider, useAuth } from './src/api/auth';
import { GameScreen } from './src/ui/GameScreen';
import { HomeScreen } from './src/ui/HomeScreen';
import { LobbyScreen, OnlineMatch } from './src/ui/LobbyScreen';
import { LoginScreen } from './src/ui/LoginScreen';
import { OnlineGameScreen } from './src/ui/OnlineGameScreen';
import { RegisterScreen } from './src/ui/RegisterScreen';
import { SettingsProvider } from './src/ui/SettingsContext';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { SplashScreen } from './src/ui/SplashScreen';
import { TournamentLobbyScreen } from './src/ui/TournamentLobbyScreen';
import { TournamentScreen } from './src/ui/TournamentScreen';
import { TournamentSummary } from './src/api/tournaments';
import { parseJoinCode } from './src/ui/deepLink';
import { colors } from './src/ui/theme';
import { useGame } from './src/ui/useGame';

const queryClient = new QueryClient();

type Route =
  | { name: 'home' }
  | { name: 'lobby'; joinCode?: string }
  | { name: 'settings' }
  | { name: 'tourneyLobby' }
  | { name: 'tournament'; id: string; initial: TournamentSummary | null }
  | { name: 'online'; match: OnlineMatch };

function AppContent() {
  const { token, loading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [route, setRoute] = useState<Route>({ name: 'home' });
  // A game the player is mid-way through (persisted), offered as "Rejoin".
  const [resume, setResume] = useState<ActiveMatch | null>(null);
  // A tournament the player is mid-way through (persisted), offered as "Rejoin".
  const [resumeTourney, setResumeTourney] = useState<ActiveTournament | null>(
    null
  );

  // A room code from a deep link (the https App Link or kadi://join/CODE),
  // applied once we're signed in.
  const [pendingJoin, setPendingJoin] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setResume(null);
      setResumeTourney(null);
      return;
    }
    void getActiveMatch().then(setResume);
    void getActiveTournament().then(setResumeTourney);
  }, [token]);

  // Capture join links (both a cold launch and links while running).
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      const joinCode = parseJoinCode(url);
      if (joinCode) setPendingJoin(joinCode);
    };
    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  // Once signed in, jump straight to the lobby with the code prefilled.
  useEffect(() => {
    if (token && pendingJoin) {
      setRoute({ name: 'lobby', joinCode: pendingJoin });
      setPendingJoin(null);
    }
  }, [token, pendingJoin]);

  const enterTournament = (t: { id: string; code: string }) => {
    void setActiveTournament({ tournamentId: t.id, code: t.code });
    setResumeTourney({ tournamentId: t.id, code: t.code });
  };

  const exitTournament = () => {
    void clearActiveTournament();
    setResumeTourney(null);
    setRoute({ name: 'home' });
  };

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

  // Online game. Keyed by matchId so a rematch remounts into a fresh game.
  if (route.name === 'online') {
    return (
      <OnlineGameScreen
        key={route.match.matchId}
        matchId={route.match.matchId}
        roster={route.match.roster}
        onExit={leaveGame}
        onRematch={(newMatchId, roster) =>
          enterGame({ matchId: newMatchId, roster })
        }
      />
    );
  }

  // Lobby.
  if (route.name === 'lobby') {
    return (
      <LobbyScreen
        onExit={() => setRoute({ name: 'home' })}
        onEnterGame={enterGame}
        initialCode={route.joinCode}
      />
    );
  }

  // Settings.
  if (route.name === 'settings') {
    return <SettingsScreen onExit={() => setRoute({ name: 'home' })} />;
  }

  // Tournament create/join.
  if (route.name === 'tourneyLobby') {
    return (
      <TournamentLobbyScreen
        onExit={() => setRoute({ name: 'home' })}
        onEnter={(t) => {
          enterTournament(t);
          setRoute({ name: 'tournament', id: t.id, initial: t });
        }}
      />
    );
  }

  // Active tournament (board → tables → results).
  if (route.name === 'tournament') {
    return (
      <TournamentScreen
        key={route.id}
        tournamentId={route.id}
        initial={route.initial}
        onExit={exitTournament}
      />
    );
  }

  // Home.
  return (
    <HomeScreen
      onStart={newGame}
      onPlayOnline={() => setRoute({ name: 'lobby' })}
      onPlayTournament={() => setRoute({ name: 'tourneyLobby' })}
      onOpenSettings={() => setRoute({ name: 'settings' })}
      resumeMatch={resume}
      onResume={() => resume && setRoute({ name: 'online', match: resume })}
      onForgetResume={leaveGame}
      resumeTournament={resumeTourney}
      onResumeTournament={() =>
        resumeTourney &&
        setRoute({
          name: 'tournament',
          id: resumeTourney.tournamentId,
          initial: null,
        })
      }
      onForgetTournament={exitTournament}
    />
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <SafeAreaProvider>
            <StatusBar style="light" />
            {showSplash ? (
              <SplashScreen onDone={() => setShowSplash(false)} />
            ) : (
              <AppContent />
            )}
          </SafeAreaProvider>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
