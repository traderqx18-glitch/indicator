import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  deleteDoc, 
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDcrMPpX9CoLzyZa0IuWeKFhXWmjs88XC4",
  authDomain: "binary-king-18.firebaseapp.com",
  projectId: "binary-king-18",
  storageBucket: "binary-king-18.firebasestorage.app",
  messagingSenderId: "866487308563",
  appId: "1:866487308563:web:e70cb58648b33bef258ae6",
  measurementId: "G-NEDPP6JN6X"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Critical connection verification function mandated by the Firebase skill guidelines
export async function testFirestoreConnection() {
  try {
    // Attempt standard server read test
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.warn("Firebase client is offline. Verify configuration or connectivity.");
    }
  }
}

// Error handling helpers conforming exactly to the Firebase Integration Skill guidelines
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: 'anonymous_trading_bot',
      email: 'no_auth_required@binaryking.com'
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Interfaces for our collections
export interface ActiveDevice {
  fingerprint: string;
  firstSeen: number; // UTC ms timestamp
  lastSeen: number; // UTC ms timestamp
}

export interface LicenseKey {
  isActive: boolean;
  deviceLimit: number;
  devices: ActiveDevice[];
  createdAt: number;
  expiryDate: number | null; // UTC ms or null
}

export interface PatternRecord {
  occurrences: number;
  successCount: number;
  failCount: number;
  successRate: number;
  lastSeen: number;
}

// Core licensing verification engine
export async function verifyLicenseKey(licenseKey: string, fingerprint: string): Promise<{ success: boolean; error?: string }> {
  const docPath = `licenses/${licenseKey}`;
  try {
    const docRef = doc(db, 'licenses', licenseKey);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return { success: false, error: 'Invalid License Key' };
    }

    const data = snap.data() as LicenseKey;

    if (!data.isActive) {
      return { success: false, error: 'License Key is Disabled' };
    }

    if (data.expiryDate && Date.now() > data.expiryDate) {
      return { success: false, error: 'License Key is Expired' };
    }

    const devicesList = data.devices || [];
    const existingIndex = devicesList.findIndex(d => d.fingerprint === fingerprint);

    if (existingIndex !== -1) {
      // Re-verify: Update lastSeen on existing fingerprint
      devicesList[existingIndex].lastSeen = Date.now();
      try {
        await setDoc(docRef, { ...data, devices: devicesList }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
      return { success: true };
    } else {
      // New device: Check device limit boundaries
      if (devicesList.length >= data.deviceLimit) {
        return { success: false, error: `Device limit reached (${devicesList.length}/${data.deviceLimit}). Contact administrator.` };
      }

      // Safe limit: Add current fingerprint session
      const newDevice: ActiveDevice = {
        fingerprint,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      };
      devicesList.push(newDevice);

      try {
        await setDoc(docRef, { ...data, devices: devicesList }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      }
      return { success: true };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

// Firebase Pattern Cache System to track matching signals mathematically
export async function getStoredPattern(pair: string, timeframe: string, patternHash: string): Promise<PatternRecord | null> {
  const safePair = pair.replace('/', '-');
  const path = `patterns/${safePair}_${timeframe}/hashes/${patternHash}`;
  try {
    const snap = await getDoc(doc(db, 'patterns', `${safePair}_${timeframe}`, 'hashes', patternHash));
    return snap.exists() ? snap.data() as PatternRecord : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function storeOrUpdatePattern(pair: string, timeframe: string, patternHash: string, success: boolean) {
  const safePair = pair.replace('/', '-');
  const path = `patterns/${safePair}_${timeframe}/hashes/${patternHash}`;
  try {
    const docRef = doc(db, 'patterns', `${safePair}_${timeframe}`, 'hashes', patternHash);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as PatternRecord;
      const occurrences = data.occurrences + 1;
      const successCount = data.successCount + (success ? 1 : 0);
      const failCount = data.failCount + (success ? 0 : 1);
      const successRate = Math.round((successCount / occurrences) * 100);

      await setDoc(docRef, {
        occurrences,
        successCount,
        failCount,
        successRate,
        lastSeen: Date.now()
      });
    } else {
      await setDoc(docRef, {
        occurrences: 1,
        successCount: success ? 1 : 0,
        failCount: success ? 0 : 1,
        successRate: success ? 100 : 0,
        lastSeen: Date.now()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Stats tracking
export async function getPatternStatistics(pair: string, timeframe: string): Promise<{ totalPatterns: number; averages: number }> {
  const safePair = pair.replace('/', '-');
  try {
    const snap = await getDocs(collection(db, 'patterns', `${safePair}_${timeframe}`, 'hashes'));
    const records = snap.docs.map(d => d.data() as PatternRecord);
    if (records.length === 0) return { totalPatterns: 0, averages: 0 };

    const totalPatterns = records.length;
    const avgSuccess = records.reduce((sum, r) => sum + r.successRate, 0) / totalPatterns;
    return { 
      totalPatterns, 
      averages: Math.round(avgSuccess)
    };
  } catch (e) {
    return { totalPatterns: 0, averages: 0 };
  }
}
