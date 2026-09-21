import { StatusBar } from 'expo-status-bar';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  TextInput,
  Alert,
  Pressable,
  ScrollView,
  Image,
  ImageBackground,
  PanResponder,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { supabase } from './supabaseClient';

const INITIAL_CEMETERY_FEATURES = [
  { id: 'entranceMain', type: 'entrance', label: 'Main Entrance', x: '30%', y: '87%', color: '#e67e22' },
  { id: 'entranceNorth', type: 'entrance', label: 'North Entrance', x: '70%', y: '5%', color: '#e67e22' },
  { id: 'entranceEast', type: 'entrance', label: 'East Entrance', x: '90%', y: '60%', color: '#e67e22' },
];

const AGNIPA_COORDINATES = {
  latitude: 12.516084,
};

const MAP_IMAGE = require('./assets/agnipa map.jpg');

const INITIAL_MAP_SECTIONS = [
  { id: 'A1', label: 'A1', x: '62%', y: '10%', width: '12%', height: '12%', color: '#4da6ff' },
  { id: 'A2', label: 'A2', x: '78%', y: '18%', width: '12%', height: '14%', color: '#4da6ff' },
  { id: 'A3', label: 'A3', x: '62%', y: '24%', width: '12%', height: '12%', color: '#4da6ff' },
  { id: 'B2', label: 'B2', x: '54%', y: '40%', width: '18%', height: '20%', color: '#4da6ff' },
  { id: 'B3', label: 'B3', x: '23%', y: '34%', width: '18%', height: '24%', color: '#4da6ff' },
  { id: 'C3', label: 'C3', x: '8%', y: '46%', width: '18%', height: '22%', color: '#4da6ff' },
  { id: 'D3', label: 'D3', x: '70%', y: '60%', width: '16%', height: '20%', color: '#4da6ff' },
  { id: 'E1', label: 'E1', x: '38%', y: '72%', width: '20%', height: '18%', color: '#4da6ff' },
];

const INITIAL_PLACES = [
  { id: 1, name: 'Juan Dela Cruz', section: 'A1', birthdate: 'January 15, 1940', dod: 'February 10, 2020', x: '65%', y: '13%' },
  { id: 2, name: 'Pero Jesus', section: 'A2', birthdate: 'March 18, 1952', dod: 'June 22, 2018', x: '81%', y: '22%' },
  { id: 3, name: 'Maria Clara', section: 'A3', birthdate: 'October 4, 1938', dod: 'December 9, 2019', x: '65%', y: '28%' },
  { id: 4, name: 'Jose Rizal', section: 'B2', birthdate: 'June 19, 1861', dod: 'December 30, 1896', x: '58%', y: '45%' },
  { id: 5, name: 'Pedro Penduko', section: 'B3', birthdate: 'August 2, 1948', dod: 'July 14, 2021', x: '28%', y: '40%' },
  { id: 6, name: 'Mario Kulob', section: 'C3', birthdate: 'September 10, 1955', dod: 'March 8, 2022', x: '13%', y: '53%' },
  { id: 7, name: 'Jonel Carpio', section: 'D3', birthdate: 'November 30, 1963', dod: 'April 5, 2023', x: '75%', y: '67%' },
  { id: 8, name: 'Ana Santos', section: 'E1', birthdate: 'January 25, 1948', dod: 'August 14, 2021', x: '43%', y: '78%' },
  { id: 9, name: 'Carlos Dizon', section: 'A1', birthdate: 'May 12, 1939', dod: 'September 21, 2020', x: '69%', y: '18%' },
  { id: 10, name: 'Luz Mendoza', section: 'A2', birthdate: 'July 6, 1944', dod: 'November 3, 2022', x: '86%', y: '27%' },
  { id: 11, name: 'Ramon Bautista', section: 'B2', birthdate: 'August 11, 1959', dod: 'March 19, 2024', x: '66%', y: '53%' },
  { id: 12, name: 'Isabel Reyes', section: 'B3', birthdate: 'March 9, 1942', dod: 'July 8, 2023', x: '36%', y: '52%', image: require('./assets/Isabel Reyes.png') },
];

const HARD_CODED_GRAVE_NAMES = [
  'Juan Dela Cruz',
  'Pero Jesus',
  'Maria Clara',
  'Jose Rizal',
  'Pedro Penduko',
  'Mario Kulob',
  'Jonel Carpio',
  'Ana Santos',
  'Carlos Dizon',
  'Luz Mendoza',
  'Ramon Bautista',
  'Isabel Reyes',
];

export default function App() {
  const [location, setLocation] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [places, setPlaces] = useState(INITIAL_PLACES);
  const [filteredPlaces, setFilteredPlaces] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState('Visitor');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [removeName, setRemoveName] = useState('');
  const [replaceName, setReplaceName] = useState('');
  const [replaceSection, setReplaceSection] = useState('');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapLocked, setMapLocked] = useState(true);
  const [activePlace, setActivePlace] = useState(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [mapContainerSize, setMapContainerSize] = useState({ width: 1, height: 1 });
  const [mapSections, setMapSections] = useState(INITIAL_MAP_SECTIONS);
  const [cemeteryFeatures, setCemeteryFeatures] = useState(INITIAL_CEMETERY_FEATURES);
  const [selectedMapItem, setSelectedMapItem] = useState(null);
  const [mapEditMode, setMapEditMode] = useState(false);
  const [routeTarget, setRouteTarget] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [databaseConnected, setDatabaseConnected] = useState(false);

  const contentTranslate = useRef(new Animated.Value(0)).current;
  const searchActive = searchText.trim() !== '';
  const visiblePlaces = searchActive ? filteredPlaces : [];
  const selectedPlace = visiblePlaces[0] || null;
  const displayPlace = activePlace || selectedPlace;
  const displayedRouteTarget = routeTarget;
  const routeOrigin = cemeteryFeatures.find(feature => feature.id === 'entranceMain') || { x: '50%', y: '94%' };
  const searchableNames = [...HARD_CODED_GRAVE_NAMES, ...places.map(place => place.name)];
  const highlightedPlaceIds = new Set(filteredPlaces.map(place => place.id));

  const mapMarkers = [
    ...places.map(place => ({
      id: `grave-${place.id}`,
      type: 'grave',
      label: place.name,
      x: place.x,
      y: place.y,
      color: highlightedPlaceIds.has(place.id) ? '#e74c3c' : '#c0392b',
      place,
    })),
    ...(searchActive ? cemeteryFeatures : []),
  ];

  const hasResults = visiblePlaces.length > 0;
  const searchHint = searchActive
    ? filteredPlaces.length === 0
      ? 'No match found. Try another name.'
      : filteredPlaces.length === 1
        ? `${filteredPlaces[0].name} found. Route shown from the main entrance.`
        : `${filteredPlaces.length} markers shown. Search the full name for a route.`
    : 'Search a name to show the marker on the map.';

  const handleModeChange = (selectedMode) => {
    setMode(selectedMode);
    setMenuOpen(false);
    if (selectedMode === 'Visitor') {
      setIsLoggedIn(false);
      setLoginUsername('');
      setLoginPassword('');
    }
  };

  const toggleMapExpanded = () => {
    setMapExpanded(prev => {
      if (!prev) {
        setMapZoom(1);
        setMapOffset({ x: 0, y: 0 });
      }
      return !prev;
    });
  };

  const zoomMapView = (delta) => {
    setMapZoom(prev => Math.min(2.6, Math.max(1, prev + delta)));
  };

  const resetMapView = () => {
    setMapZoom(1);
    setMapOffset({ x: 0, y: 0 });
  };

  const mapOffsetRef = useRef(mapOffset);
  const mapLockedRef = useRef(mapLocked);
  const mapDragStart = useRef({ x: 0, y: 0 });
  mapOffsetRef.current = mapOffset;
  mapLockedRef.current = mapLocked;
  const mapPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => !mapLockedRef.current && (
        Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4
      ),
      onPanResponderGrant: () => {
        mapDragStart.current = mapOffsetRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        setMapOffset({
          x: mapDragStart.current.x + gestureState.dx,
          y: mapDragStart.current.y + gestureState.dy,
        });
      },
    })
  ).current;

  const toggleMapEditMode = () => {
    setMapEditMode(prev => !prev);
    setSelectedMapItem(null);
  };

  const updateMapItemPosition = (item, deltaX, deltaY) => {
    const updateValue = (value, delta) => {
      const num = parseFloat(value.replace('%', ''));
      return `${Math.min(100, Math.max(0, num + delta))}%`;
    };

    if (item.type === 'section') {
      setMapSections(prev => prev.map(section => section.id === item.id ? { ...section, x: updateValue(section.x, deltaX), y: updateValue(section.y, deltaY) } : section));
      setSelectedMapItem(prev => prev && prev.id === item.id ? { ...prev, x: updateValue(prev.x, deltaX), y: updateValue(prev.y, deltaY) } : prev);
    } else if (item.type === 'grave') {
      setPlaces(prev => prev.map(place => place.id === item.place.id ? { ...place, x: updateValue(place.x, deltaX), y: updateValue(place.y, deltaY) } : place));
      setSelectedMapItem(prev => prev && prev.id === item.id ? { ...prev, x: updateValue(prev.x, deltaX), y: updateValue(prev.y, deltaY) } : prev);
    } else {
      setCemeteryFeatures(prev => prev.map(feature => feature.id === item.id ? { ...feature, x: updateValue(feature.x, deltaX), y: updateValue(feature.y, deltaY) } : feature));
      setSelectedMapItem(prev => prev && prev.id === item.id ? { ...prev, x: updateValue(prev.x, deltaX), y: updateValue(prev.y, deltaY) } : prev);
    }
  };

  const setExactMapPosition = (item, xPercent, yPercent) => {
    const normalize = (value) => Math.min(100, Math.max(0, value));
    const nextX = `${normalize(xPercent)}%`;
    const nextY = `${normalize(yPercent)}%`;

    if (item.type === 'section') {
      setMapSections(prev => prev.map(section => section.id === item.id ? { ...section, x: nextX, y: nextY } : section));
    } else if (item.type === 'grave') {
      setPlaces(prev => prev.map(place => place.id === item.place.id ? { ...place, x: nextX, y: nextY } : place));
    } else {
      setCemeteryFeatures(prev => prev.map(feature => feature.id === item.id ? { ...feature, x: nextX, y: nextY } : feature));
    }

    setSelectedMapItem(prev => prev && prev.id === item.id ? { ...prev, x: nextX, y: nextY } : { ...item, x: nextX, y: nextY });
  };

  const handleMapTap = (event) => {
    if (!mapEditMode || !selectedMapItem) return;

    const xPercent = (event.nativeEvent.locationX / Math.max(mapContainerSize.width, 1)) * 100;
    const yPercent = (event.nativeEvent.locationY / Math.max(mapContainerSize.height, 1)) * 100;
    setExactMapPosition(selectedMapItem, xPercent, yPercent);
  };

  const selectMapItem = (item) => {
    setSelectedMapItem(item);
    if (item.type === 'grave') {
      setActivePlace(item.place);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    const getLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'Location permission is required to show your position on the map.');
          return;
        }
        const positionPromise = Location.getCurrentPositionAsync({});
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        const locationData = await Promise.race([positionPromise, timeout]);
        setLocation(locationData.coords);
      } catch (err) {
        // don't block startup on location issues
        console.log('Location error or timeout:', err && err.message ? err.message : err);
      }
    };

    getLocation();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!supabase) return;

    const loadGraves = async () => {
      const { data, error } = await supabase.from('graves').select('*').order('id');
      if (error) {
        console.log('Supabase load error:', error.message);
        return;
      }

      setPlaces(data.map(place => place.name === 'Isabel Reyes'
        ? { ...place, image: require('./assets/Isabel Reyes.png') }
        : place));
      setDatabaseConnected(true);
    };

    loadGraves();
  }, []);

  useEffect(() => {
    Animated.timing(contentTranslate, {
      toValue: menuOpen ? 280 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [menuOpen, contentTranslate]);

  useEffect(() => {
    if (searchText.trim() === '') {
      setFilteredPlaces([]);
    } else {
      const query = searchText.toLowerCase();
      const filtered = places.filter(place => {
        const normalizedName = place.name.toLowerCase();
        return normalizedName.includes(query) || searchableNames.some(name => name.toLowerCase().includes(query) && name.toLowerCase() === normalizedName);
      });

      setFilteredPlaces(filtered);
    }
  }, [searchText, places]);

  useEffect(() => {
    if (searchText.trim() === '') {
      setActivePlace(null);
      setRouteTarget(null);
    }
  }, [searchText]);

  useEffect(() => {
    if (filteredPlaces.length !== 1) {
      setRouteTarget(null);
    }
  }, [filteredPlaces]);

  const selectSearchResult = (place) => {
    setActivePlace(place);
    setRouteTarget(place);
  };

  const navigateToPlace = (place) => {
    setRouteTarget(place);
    setActivePlace(place);
    Alert.alert('Route shown', `${place.name} is now marked on the cemetery map.`);
  };

  const routeSegments = displayedRouteTarget && routeOrigin && displayedRouteTarget.x && displayedRouteTarget.y
    ? (() => {
        const parsePercent = (value) => parseFloat(String(value).replace('%', '')) || 0;
        const startX = parsePercent(routeOrigin.x);
        const startY = parsePercent(routeOrigin.y);
        const endX = parsePercent(displayedRouteTarget.x);
        const endY = parsePercent(displayedRouteTarget.y);
        const routePoints = [
          { x: startX, y: startY },
          { x: 37, y: 83 },
          { x: 50.5, y: 81.7 },
          { x: 49.7, y: 86.1 },
          { x: 52.1, y: 87 },
          { x: 53.9, y: 85.9 },
          { x: endX, y: endY },
        ];
        const segments = [];

        for (let i = 0; i < routePoints.length - 1; i += 1) {
          const point = routePoints[i];
          const nextPoint = routePoints[i + 1];
          const x1 = point.x;
          const y1 = point.y;
          const x2 = nextPoint.x;
          const y2 = nextPoint.y;
          const length = Math.hypot(x2 - x1, y2 - y1);
          const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

          if (length < 1) continue;

          segments.push({
            left: `${x1}%`,
            top: `${y1}%`,
            width: `${length}%`,
            transform: [{ rotate: `${angle}deg` }],
          });
        }

        return segments;
      })()
    : [];

  const addNewPlace = () => {
    if (newName && newSection && newLevel) {
      const newPlace = {
        id: Math.max(...places.map(place => place.id), 0) + 1,
        name: newName,
        section: newSection,
        level: parseInt(newLevel, 10),
        x: '50%',
        y: '50%',
      };

      setPlaces(prev => [...prev, newPlace]);
      if (supabase) {
        supabase.from('graves').insert({
          name: newPlace.name,
          section: newPlace.section,
          level: newPlace.level,
          x: newPlace.x,
          y: newPlace.y,
        }).then(({ error }) => {
          if (error) Alert.alert('Database error', error.message);
        });
      }
      setNewName('');
      setNewSection('');
      setNewLevel('');
      Alert.alert('Success', 'New deceased record added.');
    } else {
      Alert.alert('Error', 'Please fill all fields.');
    }
  };

  const removePlace = () => {
    const query = removeName.trim().toLowerCase();
    const place = places.find(item => item.name.toLowerCase() === query);

    if (!place) {
      Alert.alert('Not found', 'No grave matches that name.');
      return;
    }

    setPlaces(prev => prev.filter(item => item.id !== place.id));
    if (supabase) {
      supabase.from('graves').delete().eq('id', place.id).then(({ error }) => {
        if (error) Alert.alert('Database error', error.message);
      });
    }
    setRemoveName('');
    Alert.alert('Success', `${place.name} was removed.`);
  };

  const replacePlaceSection = () => {
    const query = replaceName.trim().toLowerCase();
    const nextSection = replaceSection.trim();
    const place = places.find(item => item.name.toLowerCase() === query);

    if (!place || !nextSection) {
      Alert.alert('Error', 'Enter an existing grave name and a new section.');
      return;
    }

    setPlaces(prev => prev.map(item => item.id === place.id ? { ...item, section: nextSection } : item));
    if (supabase) {
      supabase.from('graves').update({ section: nextSection }).eq('id', place.id).then(({ error }) => {
        if (error) Alert.alert('Database error', error.message);
      });
    }
    setReplaceName('');
    setReplaceSection('');
    Alert.alert('Success', `${place.name} was moved to section ${nextSection}.`);
  };

  const handleLogin = async () => {
    if (mode === 'Visitor') {
      setIsLoggedIn(true);
      return;
    }

    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginUsername,
        password: loginPassword,
      });

      if (error) {
        Alert.alert('Login error', error.message);
        return;
      }

      setIsLoggedIn(true);
      setLoginUsername('');
      setLoginPassword('');
      return;
    }

    if (loginUsername === 'Admin' && loginPassword === '12345678') {
      setIsLoggedIn(true);
      setLoginUsername('');
      setLoginPassword('');
      Alert.alert('Success', 'Logged in successfully.');
    } else {
      Alert.alert('Error', 'Invalid username or password.');
    }
  };

  const selectLoginRole = (selectedMode) => {
    setMode(selectedMode);
    setLoginUsername('');
    setLoginPassword('');
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsLoggedIn(false);
    setLoginUsername('');
    setLoginPassword('');
  };

  if (!isLoggedIn) {
    return (
      <View style={styles.loginScreen}>
        <StatusBar style="light" />
        <View style={styles.loginCard}>
          <Text style={styles.loginTitle}>Cemetery Map</Text>
          <Text style={styles.loginSubtitle}>Choose how you want to enter</Text>

          <View style={styles.roleRow}>
            {['Visitor', 'Admin'].map(role => (
              <Pressable
                key={role}
                style={[styles.roleButton, mode === role && styles.selectedRoleButton]}
                onPress={() => selectLoginRole(role)}
              >
                <Text style={[styles.roleButtonText, mode === role && styles.selectedRoleButtonText]}>{role}</Text>
              </Pressable>
            ))}
          </View>

          {mode === 'Admin' && (
            <>
              <TextInput
                value={loginUsername}
                onChangeText={setLoginUsername}
                style={styles.input}
                placeholder="Admin email"
                autoCapitalize="none"
              />
              <TextInput
                value={loginPassword}
                onChangeText={setLoginPassword}
                style={styles.input}
                placeholder="Password"
                secureTextEntry
              />
            </>
          )}

          <Pressable style={styles.submitButton} onPress={handleLogin}>
            <Text style={styles.submitButtonText}>{mode === 'Visitor' ? 'Continue as Visitor' : 'Login as Admin'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.appShell}>
      <StatusBar style="light" />

      <Animated.View style={[styles.mainContent, { transform: [{ translateX: contentTranslate }] }]}>
        <View style={styles.topBar}>
          <Pressable style={styles.menuButton} onPress={() => setMenuOpen(prev => !prev)}>
            <Text style={styles.menuButtonText}>{menuOpen ? '✕' : '☰'}</Text>
          </Pressable>

          <Text style={styles.title}>{mode === 'Admin' ? 'Admin Records' : 'Cemetery Map'}</Text>

          <View style={styles.topBarSpacer} />
        </View>

        {mode === 'Visitor' ? (
          <>
        <View style={styles.toolbarRow}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
            placeholder="Search grave name"
            placeholderTextColor="#8aa4b8"
          />
          <Pressable style={styles.roundButton} onPress={() => setMapExpanded(prev => !prev)}>
            <Text style={styles.roundButtonText}>{mapExpanded ? 'Exit' : 'Map'}</Text>
          </Pressable>
        </View>

        {searchActive && (
          <>
            <Text style={styles.searchHint}>{searchHint}</Text>
            {filteredPlaces.length === 1 && (
              <Pressable style={styles.searchResultButton} onPress={() => selectSearchResult(filteredPlaces[0])}>
                <Text style={styles.searchResultButtonText}>View result: {filteredPlaces[0].name}</Text>
              </Pressable>
            )}
          </>
        )}

        <View style={[styles.mapCard, mapExpanded && styles.mapCardExpanded]}>
          <View style={styles.mapTools}>
            <Pressable style={styles.toolButton} onPress={() => zoomMapView(0.2)}>
              <Text style={styles.toolButtonText}>+</Text>
            </Pressable>
            <Pressable style={styles.toolButton} onPress={() => zoomMapView(0.2)}>
              <Text style={styles.toolButtonText}>−</Text>
            </Pressable>
            <Pressable style={styles.toolButton} onPress={resetMapView}>
              <Text style={styles.toolButtonText}>Reset</Text>
            </Pressable>
            <Pressable style={styles.toolButton} onPress={() => setMapLocked(prev => !prev)}>
              <Text style={styles.toolButtonText}>{mapLocked ? 'Unlock' : 'Lock'}</Text>
            </Pressable>
          </View>

          <ImageBackground
            source={MAP_IMAGE}
            style={[styles.mapImage, { transform: [{ scale: mapZoom }, { translateX: mapOffset.x }, { translateY: mapOffset.y }] }]}
            resizeMode="contain"
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setMapContainerSize({ width, height });
            }}
            {...mapPanResponder.panHandlers}
            onPress={handleMapTap}
          >
            {routeSegments.map((segment, index) => (
              <View key={`route-${index}`} style={[styles.routeSegment, segment]} />
            ))}
          </ImageBackground>
        </View>

        {displayPlace && (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>{displayPlace.name}</Text>
            {displayPlace.image && (
              <Image source={displayPlace.image} style={styles.gravePhoto} resizeMode="contain" />
            )}
            <Text style={styles.detailText}>Section: {displayPlace.section || 'N/A'}</Text>
            <Text style={styles.detailText}>Birthdate: {displayPlace.birthdate || 'N/A'}</Text>
            <Text style={styles.detailText}>Died: {displayPlace.dod || 'N/A'}</Text>

            <Pressable style={styles.navigateButton} onPress={() => navigateToPlace(displayPlace)}>
              <Text style={styles.navigateButtonText}>Navigate</Text>
            </Pressable>
          </View>
        )}

        {showAddForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add deceased record</Text>
            <TextInput value={newName} onChangeText={setNewName} style={styles.input} placeholder="Name" />
            <TextInput value={newSection} onChangeText={setNewSection} style={styles.input} placeholder="Section" />
            <TextInput value={newLevel} onChangeText={setNewLevel} style={styles.input} placeholder="Level" keyboardType="numeric" />
            <Pressable style={styles.submitButton} onPress={addNewPlace}>
              <Text style={styles.submitButtonText}>Save record</Text>
            </Pressable>
          </View>
        )}
          </>
        ) : (
          <ScrollView contentContainerStyle={styles.adminPanel}>
            <Text style={styles.adminTitle}>Grave records</Text>
            <Text style={styles.adminSubtitle}>
              Manage records and sections without opening the map. {databaseConnected ? 'Connected to Supabase.' : 'Using local records.'}
            </Text>

            <View style={styles.adminAction}>
              <Text style={styles.adminActionTitle}>Add grave</Text>
              <TextInput value={newName} onChangeText={setNewName} style={styles.input} placeholder="Name" />
              <TextInput value={newSection} onChangeText={setNewSection} style={styles.input} placeholder="Section" />
              <TextInput value={newLevel} onChangeText={setNewLevel} style={styles.input} placeholder="Level" keyboardType="numeric" />
              <Pressable style={styles.submitButton} onPress={addNewPlace}>
                <Text style={styles.submitButtonText}>Add grave</Text>
              </Pressable>
            </View>

            <View style={styles.adminAction}>
              <Text style={styles.adminActionTitle}>Remove grave</Text>
              <TextInput value={removeName} onChangeText={setRemoveName} style={styles.input} placeholder="Exact grave name" />
              <Pressable style={styles.dangerButton} onPress={removePlace}>
                <Text style={styles.submitButtonText}>Remove grave</Text>
              </Pressable>
            </View>

            <View style={styles.adminAction}>
              <Text style={styles.adminActionTitle}>Move grave to another section</Text>
              <TextInput value={replaceName} onChangeText={setReplaceName} style={styles.input} placeholder="Exact grave name" />
              <TextInput value={replaceSection} onChangeText={setReplaceSection} style={styles.input} placeholder="New section" />
              <Pressable style={styles.secondaryButton} onPress={replacePlaceSection}>
                <Text style={styles.submitButtonText}>Move grave</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </Animated.View>

      {menuOpen && (
        <View style={styles.sideMenu}>
          <Text style={styles.menuTitle}>Menu</Text>

          <Pressable onPress={() => handleModeChange('Visitor')} style={[styles.menuItem, mode === 'Visitor' && styles.activeMenuItem]}>
            <Text style={styles.menuItemText}>Visitor</Text>
          </Pressable>
          <Pressable onPress={() => handleModeChange('Admin')} style={[styles.menuItem, mode === 'Admin' && styles.activeMenuItem]}>
            <Text style={styles.menuItemText}>Admin</Text>
          </Pressable>

          {isLoggedIn && (
            <Pressable style={styles.menuItem} onPress={handleLogout}>
              <Text style={styles.menuItemText}>Logout</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loginScreen: {
    flex: 1,
    backgroundColor: '#0b1724',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  loginTitle: {
    color: '#18314d',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  loginSubtitle: {
    color: '#5b7083',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  roleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd7e2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  selectedRoleButton: {
    backgroundColor: '#2c7be5',
    borderColor: '#2c7be5',
  },
  roleButtonText: {
    color: '#334e68',
    fontWeight: '700',
  },
  selectedRoleButtonText: {
    color: '#fff',
  },
  adminPanel: {
    padding: 16,
    paddingBottom: 32,
  },
  adminTitle: {
    color: '#18314d',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 4,
  },
  adminSubtitle: {
    color: '#5b7083',
    marginBottom: 16,
  },
  adminAction: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d6e3ef',
    padding: 16,
    marginBottom: 14,
  },
  adminActionTitle: {
    color: '#18314d',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  dangerButton: {
    backgroundColor: '#c0392b',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#0e7490',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  appShell: {
    flex: 1,
    backgroundColor: '#0b1724',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#dfeaf5',
  },
  topBar: {
    height: 72,
    backgroundColor: '#11324d',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1d4e7a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  topBarSpacer: {
    width: 42,
    height: 42,
  },
  modeBadge: {
    backgroundColor: '#2c7be5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modeBadgeText: {
    color: '#fff',
    fontWeight: '700',
  },
  toolbarRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd7e2',
    paddingHorizontal: 12,
    color: '#1d2a36',
  },
  roundButton: {
    height: 42,
    minWidth: 62,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#0b7a75',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  searchHint: {
    color: '#2f4a5d',
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchResultButton: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#0e7490',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  searchResultButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  mapCard: {
    marginHorizontal: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#bfdbf7',
    borderWidth: 1,
    borderColor: '#8fb5de',
    height: 430,
  },
  mapCardExpanded: {
    height: 620,
  },
  mapTools: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 4,
    flexDirection: 'row',
    gap: 8,
  },
  toolButton: {
    backgroundColor: 'rgba(18, 45, 68, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toolButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  mapImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#d7e4ed',
  },
  mapSection: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapSectionLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  mapMarker: {
    position: 'absolute',
    minWidth: 18,
    minHeight: 18,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    transform: [{ translateX: -6 }, { translateY: -6 }],
  },
  mapMarkerText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
  },
  routeSegment: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#ff8a00',
    borderRadius: 999,
    opacity: 0.9,
  },
  userLocationMarker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 10,
    backgroundColor: '#38bdf8',
    borderWidth: 3,
    borderColor: '#fff',
    transform: [{ translateX: -8 }, { translateY: -8 }],
  },
  detailCard: {
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d6e3ef',
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#18314d',
    marginBottom: 8,
  },
  gravePhoto: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    marginBottom: 12,
  },
  detailText: {
    fontSize: 14,
    color: '#334e68',
    marginBottom: 4,
  },
  navigateButton: {
    backgroundColor: '#0e7490',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  navigateButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  formCard: {
    marginTop: 12,
    marginHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 16,
    borderWidth: 1,
    borderColor: '#d6e3ef',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#17314e',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#f4f8fb',
    borderWidth: 1,
    borderColor: '#d6e3ef',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: '#1d2a36',
  },
  submitButton: {
    backgroundColor: '#1a7f5a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  sideMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    backgroundColor: '#10253a',
    paddingTop: 80,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  menuTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
  },
  menuItem: {
    backgroundColor: '#1a3557',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  activeMenuItem: {
    backgroundColor: '#2a5f9c',
  },
  menuItemText: {
    color: '#fff',
    fontWeight: '700',
  },
  loginBox: {
    marginTop: 12,
  },
});
