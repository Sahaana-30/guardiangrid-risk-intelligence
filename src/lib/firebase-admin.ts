import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const adminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        projectId: firebaseConfig.projectId,
      });

export const adminAuth = getAuth(adminApp);
