import { useEffect, useMemo, useRef, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./App.css";
import Login from "./Login";
import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import {
  schoolOrgId,
  generateTaskId,
  generateCategoryId,
  generateDepartmentId,
} from "./utils/firestoreIds";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db, auth, storage } from "./firebase";
import { loadOrgTasksForCurrentUser, loadUserTasks } from "./services/taskService";
import {
  createInvitation,
  getPendingInvitationsForEmail,
  acceptInvitation,
} from "./services/invitationService";

function App() {
  const [tasks, setTasks] = useState([]);
  const [categoriesData, setCategoriesData] = useState([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState("ALL_TASKS");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [contextMenu, setContextMenu] = useState(null);
  const [colorMenuCategory, setColorMenuCategory] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedCategory, setDraggedCategory] = useState(null);
  const [dragOverCategory, setDragOverCategory] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [currentUser, setCurrentUser] = useState(null);
  const [organizationId, setOrganizationId] = useState(null);
  const [organizationName, setOrganizationName] = useState(null);
  const [, setOrgOwnerEmail] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [createOrgName, setCreateOrgName] = useState("");
  const [createOrgLoading, setCreateOrgLoading] = useState(false);
  const [createOrgError, setCreateOrgError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [membershipStatus, setMembershipStatus] = useState(null);
  const [pendingInvitation, setPendingInvitation] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("student");
  const [inviteDepartmentId, setInviteDepartmentId] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [newDeptName, setNewDeptName] = useState("");
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptError, setDeptError] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [pendingConfirmFile, setPendingConfirmFile] = useState(null);
  const [fileUploadStatuses, setFileUploadStatuses] = useState({});
  const fileInputRef = useRef(null);

  const [editingAttachment, setEditingAttachment] = useState(null);
  const [replaceFile, setReplaceFile] = useState(null);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const replaceFileInputRef = useRef(null);

  const [newTask, setNewTask] = useState({
    title: "",
    dueDate: "",
    status: "PENDING",
    category: "SCHOOL",
  });

  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");

  const fixedCategories = ["PERSONAL", "WORK", "SCHOOL", "OTHER"];
  const lockedColorCategories = ["OTHER"];

  const categoryColorOptions = [
    "#edc3a6",
    "#e4a779",
    "#b29d8e",
    "#f9c7a1",
    "#f8b4c6",
    "#fde68a",
    "#fdba74",
    "#86efac",
    "#6ee7b7",
    "#93c5fd",
    "#c4b5fd",
    "#f0abfc",
    "#fca5a5",
    "#fcd34d",
    "#1a2b4a",
    "#243355",
    "#3b5a8a",
    "#a3e635",
  ];

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        console.log("[auth] onAuthStateChanged fired — uid:", firebaseUser.uid);
        const userRef = doc(db, "users", firebaseUser.uid);
        let existingData = null;

        // ── Step 1: read existing user document ──────────────────────────────
        try {
          const userSnap = await getDoc(userRef);
          existingData = userSnap.exists() ? userSnap.data() : null;
          console.log("[auth] user doc exists:", !!existingData, "| membershipStatus:", existingData?.membershipStatus ?? "(none)");
        } catch (err) {
          console.error("[auth] Step 1 FAILED:", err.code, err.message);
        }

        // ── Step 2: resolve membership from flat fields ───────────────────────
        // Migration: existing users without membershipStatus are inferred from organizationId+role.
        // Fall back to old organizations array if the flat role field is missing (pre-migration doc).
        const resolvedOrgId = existingData?.organizationId ?? null;
        // Flat role (new schema) or fall back to matching entry in old organizations array
        const orgArrayEntry = (existingData?.organizations ?? []).find(
          (o) => o.organizationId === resolvedOrgId && o.status === "activated"
        ) ?? null;
        const resolvedRole = existingData?.role ?? orgArrayEntry?.role ?? null;
        const resolvedOrgName = existingData?.organizationName ?? null;
        let resolvedStatus = existingData?.membershipStatus ?? null;
        // Correction: if status was incorrectly written as "not_invited" but user has an org+role,
        // fix it back to "active" (covers bad earlier migration run).
        if (resolvedStatus === "not_invited" && resolvedOrgId && resolvedRole) {
          resolvedStatus = "active";
        }
        if (!resolvedStatus) {
          resolvedStatus = (resolvedOrgId && resolvedRole) ? "active" : "not_invited";
        }
        console.log("[auth] resolvedStatus:", resolvedStatus, "| orgId:", resolvedOrgId ?? "(none)", "| role:", resolvedRole ?? "(none)");

        // ── Step 3: write or refresh the user document ───────────────────────
        if (!existingData) {
          try {
            await setDoc(userRef, {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName ?? null,
              organizationId: null,
              role: null,
              departmentId: null,
              membershipStatus: "not_invited",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            console.log("[auth] new user doc created");
          } catch (err) {
            console.error("[auth] Step 3 create FAILED:", err.code, err.message);
          }
        } else {
          // Refresh profile fields. Also write inferred membershipStatus and role for migration.
          const mergeData = {
            displayName: firebaseUser.displayName ?? null,
            email: firebaseUser.email,
            updatedAt: serverTimestamp(),
          };
          if (!existingData.membershipStatus) {
            mergeData.membershipStatus = resolvedStatus;
          }
          if (!existingData.role && resolvedRole) {
            mergeData.role = resolvedRole;
          }
          try {
            await setDoc(userRef, mergeData, { merge: true });
            console.log("[auth] user doc refreshed");
          } catch (err) {
            console.error("[auth] Step 3 merge FAILED:", err.code, err.message);
          }
        }

        // ── Step 2.5: load pending invitation for non-active users ───────────────
        let invitation = null;
        if (resolvedStatus !== "active") {
          try {
            const invites = await getPendingInvitationsForEmail(firebaseUser.email);
            console.log("[auth] pending invitations found:", invites.length);
            if (invites.length > 0) {
              invitation = invites[0];
              console.log("[auth] invitation —", invitation.id, "| org:", invitation.organizationId, "| role:", invitation.role);
            }
          } catch (err) {
            console.error("[auth] Step 2.5 FAILED:", err.code, err.message);
          }
        }

        // ── Step 4: set state and route ───────────────────────────────────────
        setMembershipStatus(resolvedStatus);
        setOrganizationId(resolvedOrgId);
        setCurrentUserRole(resolvedRole);
        if (resolvedOrgName) {
          setOrganizationName(resolvedOrgName);
        }
        if (invitation) {
          setPendingInvitation(invitation);
        }

        if (resolvedStatus === "active") {
          setActiveView("ALL_TASKS");
        } else if (invitation) {
          setActiveView("PENDING_MEMBERSHIP");
        } else {
          setActiveView("CREATE_ORG");
        }
      } else {
        console.log("[auth] onAuthStateChanged fired — user signed out");
        setOrganizationId(null);
        setOrganizationName(null);
        setCurrentUserRole(null);
        setMembershipStatus(null);
        setPendingInvitation(null);
      }
      setCurrentUser(firebaseUser ?? null);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    window.cleanupOrphanedStorageFiles = cleanupOrphanedStorageFiles;
    return () => {
      delete window.cleanupOrphanedStorageFiles;
    };
  });

  useEffect(() => {
    if (!currentUser || !organizationId) {
      console.log("[testComplexTaskQuery] not registered yet", {
        hasCurrentUser: !!currentUser,
        activeOrganizationId: organizationId
      });
      return;
    }

    window.testComplexTaskQuery = async (status = "PENDING") => {
      console.log("[testComplexTaskQuery] running", {
        activeOrganizationId: organizationId,
        uid: currentUser.uid,
        status
      });

      console.time("complexTaskQuery");

      const results = await loadOrgTasksForCurrentUser(
        organizationId,
        currentUser.uid,
        status
      );

      console.timeEnd("complexTaskQuery");
      console.log("[testComplexTaskQuery] result count:", results.length);
      console.log("[testComplexTaskQuery] results:", results);

      return results;
    };

    console.log("[testComplexTaskQuery] registered. Run: await window.testComplexTaskQuery()");

    return () => {
      delete window.testComplexTaskQuery;
    };
  }, [currentUser, organizationId]);

  const loadTasks = async () => {
    try {
      setError("");

      if (!currentUser?.uid) {
        setTasks([]);
        return;
      }

      console.log("[tasks] loadTasks — userId:", currentUser.uid, "| organizationId used in query:", organizationId ?? "(none)");
      const data = await loadUserTasks(currentUser.uid, organizationId);
      setTasks(data);
    } catch (err) {
      console.error(err);
      setError("Could not load tasks.");
    }
  };

  const loadCategories = async () => {
    try {
      if (!currentUser?.uid) {
        setCategoriesData([]);
        return;
      }
      console.log("[categories] loadCategories — userId:", currentUser.uid, "| organizationId used in query:", organizationId ?? "(none)");
      const constraints = [where("userId", "==", currentUser.uid)];
      if (organizationId) {
        constraints.push(where("organizationId", "==", organizationId));
      }
      const q = query(collection(db, "categories"), ...constraints);
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setCategoriesData(data);
    } catch (err) {
      console.error(err);
      setError("Could not load categories.");
    }
  };

  const handleLogin = () => {
    setTasks([]);
    setCategoriesData([]);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
    }
    setTasks([]);
    setCategoriesData([]);
    setOrganizationId(null);
    setOrganizationName(null);
    setOrgOwnerEmail(null);
    setCurrentUserRole(null);
    setMembershipStatus(null);
    setDepartments([]);
    setCreateOrgName("");
    setCreateOrgError("");
    setInviteEmail("");
    setInviteRole("student");
    setInviteDepartmentId("");
    setInviteError("");
    setInviteSuccess("");
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    const name = createOrgName.trim();
    if (!name) {
      setCreateOrgError("Please enter a school name.");
      return;
    }
    if (!currentUser?.uid) return;
    setCreateOrgLoading(true);
    setCreateOrgError("");
    console.log("[createOrg] AUTH USER", {
      uid: currentUser.uid,
      email: currentUser.email,
      emailVerified: currentUser.emailVerified,
    });

    const orgId = schoolOrgId(name);
    const adminEmail = currentUser.email || "";

    const orgData = {
      id: orgId,
      name: name,
      createdBy: currentUser.uid,
      createdByEmail: adminEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    console.log("[createOrg] ORG WRITE PATH", `organizations/${orgId}`);

    try {
      const orgRef = doc(db, "organizations", orgId);
      await setDoc(orgRef, orgData);
      console.log("[createOrg] organization created — id:", orgId);
    } catch (error) {
      console.error("[createOrg] ORG WRITE FAILED", error);
      setCreateOrgError(`Could not create organization: ${error.message}`);
      setCreateOrgLoading(false);
      return;
    }

    try {
      await setDoc(
        doc(db, "users", currentUser.uid),
        {
          organizationId: orgId,
          role: "admin",
          departmentId: null,
          membershipStatus: "active",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      console.log("[createOrg] users/", currentUser.uid, "updated — organizationId:", orgId, "| role: admin | membershipStatus: active");
    } catch (error) {
      console.error("[createOrg] user doc update FAILED", error);
      setCreateOrgError(`Could not update user profile: ${error.message}`);
      setCreateOrgLoading(false);
      return;
    }

    setOrganizationId(orgId);
    setOrganizationName(name);
    setCurrentUserRole("admin");
    setMembershipStatus("active");
    setCreateOrgName("");
    try {
      const { loadUserTasks } = await import("./services/taskService");
      const freshTasks = await loadUserTasks(currentUser.uid, orgId);
      setTasks(freshTasks);
    } catch (taskErr) {
      console.warn("[createOrg] Could not reload tasks:", taskErr.message);
    }
    setActiveView("ALL_TASKS");
    setCreateOrgLoading(false);
  };

  const handleAcceptMembership = async () => {
    if (!pendingInvitation) return;
    try {
      setError("");
      // Step 1: mark the invitation as accepted
      await acceptInvitation(pendingInvitation.id);

      // Step 2: update users/{uid} with org fields from the invitation
      const userUpdateData = {
        organizationId: pendingInvitation.organizationId,
        organizationName: pendingInvitation.organizationName ?? null,
        role: pendingInvitation.role,
        departmentId: pendingInvitation.departmentId ?? null,
        departmentName: pendingInvitation.departmentName ?? null,
        membershipStatus: "active",
        updatedAt: serverTimestamp(),
      };
      console.log("[membership] accepting invitation:", pendingInvitation.id, "| writing to users/", currentUser.uid, ":", userUpdateData);
      await updateDoc(doc(db, "users", currentUser.uid), userUpdateData);

      setOrganizationId(pendingInvitation.organizationId);
      setOrganizationName(pendingInvitation.organizationName ?? null);
      setCurrentUserRole(pendingInvitation.role);
      setMembershipStatus("active");
      setPendingInvitation(null);
      setActiveView("ALL_TASKS");
      console.log("[membership] accepted — orgId:", pendingInvitation.organizationId, "| role:", pendingInvitation.role);
    } catch (err) {
      console.error("[membership] accept FAILED:", err);
      setError("Could not accept invitation: " + err.message);
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("Please enter an email address.");
      return;
    }
    setInviteLoading(true);
    setInviteError("");
    setInviteSuccess("");

    try {
      // ── Diagnostic: read current admin user's Firestore doc ─────────────────
      const adminDocSnap = await getDoc(doc(db, "users", currentUser.uid));
      const adminDocData = adminDocSnap.exists() ? adminDocSnap.data() : null;
      console.log("[invite:diag] 1. currentUser.uid          :", currentUser.uid);
      console.log("[invite:diag] 2. currentUser.email        :", currentUser.email);
      console.log("[invite:diag] 3. users/{uid} doc          :", JSON.stringify(adminDocData));
      console.log("[invite:diag] 4. activeOrganizationId     :", organizationId);
      console.log("[invite:diag] 5. selected role            :", inviteRole);
      console.log("[invite:diag] 6. selected departmentId    :", inviteDepartmentId || "(none)");

      // ── Verify the invitee already has an account ────────────────────────────
      const q = query(collection(db, "users"), where("email", "==", email));
      const snap = await getDocs(q);
      const inviteeExists = !snap.empty;
      const inviteeData = inviteeExists ? snap.docs[0].data() : null;
      console.log("[invite:diag]    invitee email            :", email);
      console.log("[invite:diag]    invitee has users doc    :", inviteeExists);
      console.log("[invite:diag]    invitee doc data         :", inviteeExists ? JSON.stringify(inviteeData) : "(no doc)");

      if (!inviteeExists) {
        setInviteError("No account found with that email. The user must sign up first.");
        setInviteLoading(false);
        return;
      }
      if (inviteeData.membershipStatus === "active") {
        setInviteError("This user already belongs to an organization.");
        setInviteLoading(false);
        return;
      }

      const selectedDept = departments.find((d) => d.id === inviteDepartmentId);
      const { generateInviteId } = await import("./utils/firestoreIds");
      const previewInviteId = generateInviteId(organizationId, email);
      const previewInviteData = {
        id: previewInviteId,
        email,
        role: inviteRole,
        organizationId,
        organizationName: organizationName ?? null,
        departmentId: inviteDepartmentId || null,
        departmentName: selectedDept?.name ?? null,
        status: "pending",
        createdBy: currentUser.uid,
        createdByEmail: currentUser.email,
      };
      console.log("[invite:diag] 7. invitation doc path      :", `invitations/${previewInviteId}`);
      console.log("[invite:diag] 8. invitation doc data      :", JSON.stringify(previewInviteData));
      console.log("[invite:diag]    isActiveAdmin check deps :", {
        role: adminDocData?.role,
        organizationId: adminDocData?.organizationId,
        membershipStatus: adminDocData?.membershipStatus ?? "(field missing)",
        membershipStatusInDoc: adminDocData ? "membershipStatus" in adminDocData : false,
      });

      const inviteId = await createInvitation({
        organizationId,
        organizationName: organizationName ?? null,
        departmentId: inviteDepartmentId || null,
        departmentName: selectedDept?.name ?? null,
        invitedEmail: email,
        role: inviteRole,
        invitedByUserId: currentUser.uid,
        invitedByEmail: currentUser.email,
      });

      console.log("[invite] created invitation:", inviteId, "| email:", email, "| org:", organizationId, "| role:", inviteRole);
      setInviteSuccess(`${email} has been invited as ${inviteRole}.`);
      setInviteEmail("");
      setInviteRole("student");
      setInviteDepartmentId("");
    } catch (err) {
      console.error("[invite] FAILED:", err);
      setInviteError("Could not send invitation: " + err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    const name = newDeptName.trim();
    if (!name) {
      setDeptError("Please enter a department name.");
      return;
    }
    setDeptLoading(true);
    setDeptError("");

    try {
      const deptId = generateDepartmentId(name);
      await setDoc(doc(db, "organizations", organizationId, "departments", deptId), {
        id: deptId,
        name: name,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewDeptName("");
      const deptSnap = await getDocs(collection(db, "organizations", organizationId, "departments"));
      setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      console.log("[departments] created —", deptId);
    } catch (err) {
      console.error("[departments] create FAILED:", err);
      setDeptError("Could not create department: " + err.message);
    } finally {
      setDeptLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadTasks();
      loadCategories();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!organizationId) {
      setOrgOwnerEmail(null);
      return;
    }
    const fetchOrg = async () => {
      try {
        const orgSnap = await getDoc(doc(db, "organizations", organizationId));
        if (orgSnap.exists()) {
          const data = orgSnap.data();
          setOrgOwnerEmail(data.createdByEmail ?? null);
          if (data.name) setOrganizationName(data.name);
          console.log("[org] org doc loaded — id:", organizationId, "| name:", data.name ?? "(none)");
        }
      } catch (err) {
        console.error("[org] Could not fetch org doc:", err.code, err.message);
      }
    };
    fetchOrg();
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || membershipStatus !== "active") {
      setDepartments([]);
      return;
    }
    const fetchDepartments = async () => {
      try {
        const deptSnap = await getDocs(collection(db, "organizations", organizationId, "departments"));
        setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        console.log("[departments] loaded for org:", organizationId);
      } catch (err) {
        console.error("[departments] Could not load:", err.code, err.message);
      }
    };
    fetchDepartments();
  }, [organizationId, membershipStatus]);

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null);
      setColorMenuCategory(null);
    };
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const categories = useMemo(() => {
    const fixedTop = ["PERSONAL", "WORK", "SCHOOL"];
    const fixedBottom = ["OTHER"];

    const byName = new Map(
      categoriesData.map((cat) => [
        cat.name?.toUpperCase(),
        { ...cat, name: cat.name?.toUpperCase() },
      ])
    );

    fixedTop.forEach((name, index) => {
      if (!byName.has(name)) {
        byName.set(name, {
          id: `fixed-${name}`,
          name,
          color: "",
          displayOrder: index + 1,
        });
      }
    });

    fixedBottom.forEach((name) => {
      if (!byName.has(name)) {
        byName.set(name, {
          id: `fixed-${name}`,
          name,
          color: "",
          displayOrder: 999,
        });
      }
    });

    const all = Array.from(byName.values());

    const fixed = all.filter((c) => fixedTop.includes(c.name));
    const custom = all.filter(
      (c) => !fixedTop.includes(c.name) && !fixedBottom.includes(c.name)
    );
    const other = all.filter((c) => fixedBottom.includes(c.name));

    fixed.sort((a, b) => fixedTop.indexOf(a.name) - fixedTop.indexOf(b.name));
    custom.sort(
      (a, b) =>
        (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999) ||
        (String(a.id) > String(b.id) ? 1 : -1)
    );
    other.sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999));

    return [...fixed, ...custom, ...other];
  }, [categoriesData]);

  const customCategories = useMemo(() => {
    return categories.filter((c) => !fixedCategories.includes(c.name));
  }, [categories]);

  const getCategoryByName = (name) => {
    return categories.find((c) => c.name === name.toUpperCase());
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setNewTask((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setNewTask({
      title: "",
      dueDate: "",
      status: "PENDING",
      category: "SCHOOL",
    });
    setUseCustomCategory(false);
    setCustomCategory("");
    setEditingTaskId(null);
    setAttachmentFiles([]);
    setPendingConfirmFile(null);
    setFileUploadStatuses({});
  };

  const sanitizeFileName = (fileName) => {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return safeName || "attachment";
  };

  const createAttachmentId = () => {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const formatFileSize = (size = 0) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extractStoragePathFromUrl = (url) => {
    try {
      const u = new URL(url);
      const segment = u.pathname.split("/o/")[1];
      if (!segment) return null;
      return decodeURIComponent(segment.split("?")[0]);
    } catch {
      return null;
    }
  };

  const removeFileFromStorage = async (path) => {
    if (!path) return;

    try {
      await deleteObject(storageRef(storage, path));
    } catch (err) {
      if (err.code !== "storage/object-not-found") {
        throw err;
      }
    }
  };

  const cleanupOrphanedStorageFiles = async (taskId) => {
    console.log(`[cleanup] Starting orphan scan for task: ${taskId}`);

    const folderRef = storageRef(storage, `tasks/${taskId}/attachments`);
    const listResult = await listAll(folderRef);
    const storageFiles = listResult.items;

    console.log(`[cleanup] Files found in Storage (${storageFiles.length}):`);
    storageFiles.forEach((item) => console.log("  storage:", item.fullPath));

    const taskDoc = await getDocs(
      query(collection(db, "tasks"), where("__name__", "==", taskId))
    );

    let referencedPaths = [];
    if (!taskDoc.empty) {
      const taskData = taskDoc.docs[0].data();
      referencedPaths = (taskData.attachments || [])
        .map((a) => a.path)
        .filter(Boolean);
    }

    console.log(`[cleanup] Paths referenced in Firestore (${referencedPaths.length}):`);
    referencedPaths.forEach((p) => console.log("  firestore:", p));

    const orphans = storageFiles.filter(
      (item) => !referencedPaths.includes(item.fullPath)
    );

    if (orphans.length === 0) {
      console.log("[cleanup] No orphaned files found. Storage is clean.");
      return;
    }

    console.log(`[cleanup] Found ${orphans.length} orphaned file(s) to delete:`);
    orphans.forEach((item) => console.log("  orphan:", item.fullPath));

    for (const orphan of orphans) {
      try {
        await deleteObject(orphan);
        console.log("[cleanup] Deleted:", orphan.fullPath);
      } catch (err) {
        console.error("[cleanup] Failed to delete:", orphan.fullPath, err.message);
      }
    }

    console.log("[cleanup] Done. Deleted", orphans.length, "orphaned file(s).");
  };

  const uploadTaskAttachments = async (taskId, files) => {
    const uploadedAttachments = [];

    for (const file of files) {
      const filePath = `tasks/${taskId}/attachments/${createAttachmentId()}-${sanitizeFileName(file.name)}`;
      const fileRef = storageRef(storage, filePath);

      await uploadBytes(fileRef, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: {
          userId: currentUser.uid,
          taskId,
        },
      });

      const url = await getDownloadURL(fileRef);
      const attachment = {
        id: createAttachmentId(),
        name: file.name,
        displayName: file.name,
        description: "",
        url,
        path: filePath,
        type: file.type || "application/octet-stream",
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "tasks", taskId), {
        attachments: arrayUnion(attachment),
      });

      uploadedAttachments.push(attachment);
    }

    return uploadedAttachments;
  };

  const handleAttachmentFileChange = (event) => {
    const newFiles = Array.from(event.target.files || []);
    if (newFiles.length === 0) return;

    setPendingConfirmFile(newFiles[0]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleConfirmUpload = () => {
    if (!pendingConfirmFile) return;
    const key = `${pendingConfirmFile.name}-${pendingConfirmFile.size}-${pendingConfirmFile.lastModified}`;
    setAttachmentFiles((prev) => {
      const existingKeys = new Set(
        prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`)
      );
      if (existingKeys.has(key)) return prev;
      return [...prev, pendingConfirmFile];
    });
    setFileUploadStatuses((prev) => ({ ...prev, [key]: "pending" }));
    setPendingConfirmFile(null);
  };

  const handleCancelPendingFile = () => {
    setPendingConfirmFile(null);
  };

  const removeSelectedAttachmentFile = (fileIndex) => {
    setAttachmentFiles((prev) => prev.filter((_, index) => index !== fileIndex));
  };

  const updateAttachmentInTask = async (taskId, updatedAttachment) => {
    const task = tasks.find((t) => t.id === taskId);
    const updatedAttachments = (task?.attachments || []).map((a) =>
      a.path === updatedAttachment.path ? updatedAttachment : a
    );
    await updateDoc(doc(db, "tasks", taskId), { attachments: updatedAttachments });
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, attachments: updatedAttachments } : t
      )
    );
  };

  const startEditAttachment = (taskId, attachment) => {
    setEditingAttachment({
      taskId,
      attachmentPath: attachment.path,
      displayName: attachment.displayName || attachment.name,
      description: attachment.description || "",
    });
    setReplaceFile(null);
  };

  const cancelEditAttachment = () => {
    setEditingAttachment(null);
    setReplaceFile(null);
  };

  const saveAttachmentMetadata = async () => {
    if (!editingAttachment) return;
    const { taskId, attachmentPath, displayName, description } = editingAttachment;

    setAttachmentSaving(true);
    try {
      setError("");
      const task = tasks.find((t) => t.id === taskId);
      const attachment = (task?.attachments || []).find(
        (a) => a.path === attachmentPath
      );
      if (!attachment) return;

      const updated = {
        ...attachment,
        displayName: displayName.trim() || attachment.name,
        description: description.trim(),
      };
      await updateAttachmentInTask(taskId, updated);
      setEditingAttachment(null);
    } catch (err) {
      console.error(err);
      setError("Could not save attachment name/description.");
    } finally {
      setAttachmentSaving(false);
    }
  };

  const handleReplaceFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setReplaceFile(file);
    if (replaceFileInputRef.current) {
      replaceFileInputRef.current.value = "";
    }
  };

  const saveAttachmentReplacement = async () => {
    if (!editingAttachment || !replaceFile) return;
    const { taskId, attachmentPath, displayName, description } = editingAttachment;

    setAttachmentSaving(true);
    try {
      setError("");

      const task = tasks.find((t) => t.id === taskId);
      const oldAttachment = (task?.attachments || []).find(
        (a) => a.path === attachmentPath
      );
      if (!oldAttachment) {
        setError("Could not find the attachment to replace. Please refresh and try again.");
        return;
      }

      const newPath = `tasks/${taskId}/attachments/${createAttachmentId()}-${sanitizeFileName(replaceFile.name)}`;
      const newRef = storageRef(storage, newPath);

      await uploadBytes(newRef, replaceFile, {
        contentType: replaceFile.type || "application/octet-stream",
        customMetadata: {
          userId: currentUser.uid,
          taskId,
        },
      });

      const newUrl = await getDownloadURL(newRef);

      const updatedAttachment = {
        ...oldAttachment,
        name: replaceFile.name,
        displayName: displayName.trim() || replaceFile.name,
        description: description.trim(),
        url: newUrl,
        path: newPath,
        type: replaceFile.type || "application/octet-stream",
        size: replaceFile.size,
        uploadedAt: new Date().toISOString(),
      };

      const updatedAttachments = (task.attachments || []).map((a) =>
        a.path === oldAttachment.path ? updatedAttachment : a
      );

      await updateDoc(doc(db, "tasks", taskId), {
        attachments: updatedAttachments,
      });

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, attachments: updatedAttachments } : t
        )
      );

      await removeFileFromStorage(oldAttachment.path);

      setEditingAttachment(null);
      setReplaceFile(null);
    } catch (err) {
      console.error("[saveAttachmentReplacement] Error:", err);
      setError(`Could not replace attachment: ${err.message}`);
    } finally {
      setAttachmentSaving(false);
    }
  };

  const renderAttachmentEditPanel = (taskId, attachment) => (
    <div className="attachment-edit-panel">
      <div className="attachment-edit-section">
        <p className="attachment-edit-section-title">Rename / describe</p>
        <div className="attachment-input-group">
          <label className="attachment-edit-field-label">Display name</label>
          <input
            type="text"
            value={editingAttachment?.displayName ?? ""}
            onChange={(e) =>
              setEditingAttachment((prev) => ({
                ...prev,
                displayName: e.target.value,
              }))
            }
            className="input-control"
            placeholder="Display name"
          />
        </div>
        <div className="attachment-input-group">
          <label className="attachment-edit-field-label">
            Description (optional)
          </label>
          <input
            type="text"
            value={editingAttachment?.description ?? ""}
            onChange={(e) =>
              setEditingAttachment((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            className="input-control"
            placeholder="e.g. Lecture notes from week 3"
          />
        </div>
        <div className="attachment-edit-actions">
          <button
            type="button"
            onClick={saveAttachmentMetadata}
            disabled={attachmentSaving}
            className="main-btn"
          >
            {attachmentSaving ? "Saving..." : "Save name & description"}
          </button>
        </div>
      </div>

      <div className="attachment-edit-section">
        <p className="attachment-edit-section-title">Replace file</p>
        <p className="attachment-edit-hint">
          Picking a new file will upload it and remove the current one from
          storage.
        </p>
        <div className="attachment-edit-actions">
          <label
            htmlFor={`replace-${attachment.path}`}
            className="add-attachment-btn"
          >
            {replaceFile ? "Change selection" : "+ Pick new file"}
          </label>
          <input
            ref={replaceFileInputRef}
            id={`replace-${attachment.path}`}
            type="file"
            style={{ display: "none" }}
            onChange={handleReplaceFileChange}
          />
          {replaceFile && (
            <span className="attachment-size">
              {replaceFile.name} ({formatFileSize(replaceFile.size)})
            </span>
          )}
        </div>
        {replaceFile && (
          <div className="attachment-edit-actions" style={{ marginTop: "8px" }}>
            <button
              type="button"
              onClick={saveAttachmentReplacement}
              disabled={attachmentSaving}
              className="main-btn"
            >
              {attachmentSaving ? "Uploading..." : "Upload & replace"}
            </button>
          </div>
        )}
      </div>

      <div className="attachment-edit-cancel">
        <button
          type="button"
          onClick={cancelEditAttachment}
          className="attachment-delete-btn"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const createCategoryInBackend = async (name) => {
    const normalizedName = name.trim().toUpperCase();
    if (!normalizedName) return normalizedName;

    const exists = getCategoryByName(normalizedName);
    if (exists) return normalizedName;

    const maxOrder = customCategories.length
      ? Math.max(...customCategories.map((c) => c.displayOrder ?? 0))
      : 3;

    const orgId = organizationId;
    if (!orgId) {
      console.warn("[categories] createCategoryInBackend — no active org, category will not be org-scoped");
    }
    const catId = generateCategoryId(currentUser.uid, normalizedName);
    await setDoc(doc(db, "categories", catId), {
      name: normalizedName,
      color: "",
      displayOrder: maxOrder + 1,
      userId: currentUser?.uid ?? null,
      userEmail: currentUser?.email ?? null,
      organizationId: orgId,
      organizationName: organizationName ?? null,
      readableId: catId,
    });

    await loadCategories();
    return normalizedName;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = {};
    if (!newTask.title.trim()) errors.title = "Task title is required.";
    if (!newTask.dueDate) errors.dueDate = "Due date is required.";
    if (useCustomCategory && !customCategory.trim()) errors.category = "Category name is required.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    try {
      setError("");
      setLoading(true);

      let finalCategory = useCustomCategory
        ? customCategory.trim().toUpperCase()
        : newTask.category;

      if (!finalCategory) throw new Error("Category is required");

      if (!fixedCategories.includes(finalCategory)) {
        finalCategory = await createCategoryInBackend(finalCategory);
      }

      if (!currentUser?.uid) {
        throw new Error("User not logged in");
      }

      const orgId = organizationId;
      if (!orgId) {
        console.warn("[tasks] handleSubmit — no active org, task will not be org-scoped");
      }

      const payload = {
        title: newTask.title.trim(),
        dueDate: newTask.dueDate,
        status: newTask.status,
        description: "",
        category: finalCategory,
        userId: currentUser.uid,
        organizationId: orgId,
      };

      let taskId = editingTaskId;

      if (editingTaskId) {
        await updateDoc(doc(db, "tasks", editingTaskId), payload);
      } else {
        const generatedId = generateTaskId(currentUser.uid, finalCategory, newTask.title.trim());
        await setDoc(doc(db, "tasks", generatedId), {
          ...payload,
          readableId: generatedId,
          attachments: [],
        });
        taskId = generatedId;
      }

      let attachmentUploadFailed = false;

      if (attachmentFiles.length > 0) {
        const uploadingMap = {};
        attachmentFiles.forEach((f) => {
          uploadingMap[`${f.name}-${f.size}-${f.lastModified}`] = "uploading";
        });
        setFileUploadStatuses(uploadingMap);

        for (const file of attachmentFiles) {
          const key = `${file.name}-${file.size}-${file.lastModified}`;
          try {
            await uploadTaskAttachments(taskId, [file]);
            setFileUploadStatuses((prev) => ({ ...prev, [key]: "complete" }));
          } catch (uploadErr) {
            console.error(uploadErr);
            setFileUploadStatuses((prev) => ({ ...prev, [key]: "failed" }));
            attachmentUploadFailed = true;
          }
        }
      }

      if (!attachmentUploadFailed) {
        resetForm();
        setActiveView("ALL_TASKS");
      }
      loadTasks();
      loadCategories();
      if (attachmentUploadFailed) {
        setError("The task was saved, but one or more files could not be uploaded. Files marked \u201CUpload failed\u201D are shown below.");
      }
    } catch (err) {
      console.error(err);
      setError(editingTaskId ? "Could not update task." : "Could not create task.");
    } finally {
      setLoading(false);
    }
  };

  const handleInlineCategorySubmit = async (event) => {
    event.preventDefault();

    try {
      const value = newCategoryName.trim().toUpperCase();
      if (!value) return;

      await createCategoryInBackend(value);
      setNewCategoryName("");
      setShowAddCategory(false);
    } catch (err) {
      console.error(err);
      setError("Could not create category.");
    }
  };

  const startEditTask = (task) => {
    setEditingTaskId(task.id);
    setAttachmentFiles([]);

    if (task.category && !fixedCategories.includes(task.category)) {
      setUseCustomCategory(true);
      setCustomCategory(task.category);
      setNewTask({
        title: task.title || "",
        dueDate: task.dueDate || "",
        status: task.status || "PENDING",
        category: "SCHOOL",
      });
    } else {
      setUseCustomCategory(false);
      setCustomCategory("");
      setNewTask({
        title: task.title || "",
        dueDate: task.dueDate || "",
        status: task.status || "PENDING",
        category: task.category || "OTHER",
      });
    }

    setActiveView("ADD_TASK");
  };

  const markAsDone = async (taskId) => {
    try {
      setError("");
      await updateDoc(doc(db, "tasks", taskId), { status: "DONE" });
      loadTasks();
    } catch (err) {
      console.error(err);
      setError("Could not update task.");
    }
  };

  const deleteTask = async (taskId) => {
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) return;

    try {
      setError("");
      const taskToDelete = tasks.find((task) => task.id === taskId);
      const attachments = taskToDelete?.attachments || [];
      await Promise.all(
        attachments.map((attachment) => removeFileFromStorage(attachment.path))
      );
      await deleteDoc(doc(db, "tasks", taskId));
      loadTasks();
    } catch (err) {
      console.error(err);
      setError("Could not delete task.");
    }
  };

  const deleteAttachment = async (taskId, attachment) => {
    const label =
      attachment.displayName || attachment.name || "this attachment";
    const confirmed = window.confirm(`Delete "${label}"?`);
    if (!confirmed) return;

    try {
      setError("");

      const storagePath =
        attachment.path || extractStoragePathFromUrl(attachment.url);

      if (!storagePath) {
        console.warn(
          "[deleteAttachment] No storage path found. Full attachment metadata:",
          JSON.stringify(attachment, null, 2)
        );
        setError(
          `Cannot delete "${label}" from storage — path information is missing. ` +
            "Please remove it manually in the Firebase Console under Storage."
        );
        return;
      }

      console.log(
        "[deleteAttachment] Step 1 — Storage path resolved:",
        storagePath
      );
      try {
        await removeFileFromStorage(storagePath);
        console.log("[deleteAttachment] Step 2 — Storage file deleted.");
      } catch (storageErr) {
        if (storageErr.code === "storage/unauthorized") {
          console.warn(
            "[deleteAttachment] Step 2 — Storage returned unauthorized for path:",
            storagePath,
            "The file may already be deleted (Firebase returns unauthorized instead of",
            "not-found when the file is missing and rules cannot read resource.metadata).",
            "Continuing with Firestore cleanup."
          );
        } else {
          throw storageErr;
        }
      }

      const task = tasks.find((item) => item.id === taskId);
      const updatedAttachments = (task?.attachments || []).filter((item) => {
        if (attachment.url) return item.url !== attachment.url;
        if (attachment.path) return item.path !== attachment.path;
        return true;
      });

      console.log(
        "[deleteAttachment] Step 3 — Writing Firestore. Remaining count:",
        updatedAttachments.length
      );
      await updateDoc(doc(db, "tasks", taskId), {
        attachments: updatedAttachments,
      });
      console.log("[deleteAttachment] Step 4 — Firestore updated.");

      setTasks((prev) =>
        prev.map((item) =>
          item.id === taskId
            ? { ...item, attachments: updatedAttachments }
            : item
        )
      );
    } catch (err) {
      console.error("[deleteAttachment] Failed:", err);
      setError(`Could not delete "${label}": ${err.message}`);
    }
  };

  const deleteCategory = async (categoryName) => {
    if (fixedCategories.includes(categoryName)) return;

    const confirmed = window.confirm(
      `Delete category "${categoryName}" and move its tasks to OTHER?`
    );
    if (!confirmed) return;

    try {
      setError("");

      const tasksQ = query(
        collection(db, "tasks"),
        where("category", "==", categoryName),
        where("userId", "==", currentUser?.uid ?? null)
      );
      const tasksSnapshot = await getDocs(tasksQ);
      await Promise.all(
        tasksSnapshot.docs.map((taskDoc) =>
          updateDoc(doc(db, "tasks", taskDoc.id), { category: "OTHER" })
        )
      );

      const category = getCategoryByName(categoryName);
      if (category?.id && !String(category.id).startsWith("fixed-")) {
        await deleteDoc(doc(db, "categories", category.id));
      }

      if (activeCategory === categoryName) {
        setActiveCategory("OTHER");
      }

      setContextMenu(null);
      loadTasks();
      loadCategories();
    } catch (err) {
      console.error(err);
      setError("Could not delete category.");
    }
  };

  const setCategoryColor = async (categoryName, color) => {
    try {
      let category = getCategoryByName(categoryName);

      if (!category?.id) return;

      if (String(category.id).startsWith("fixed-")) {
        const maxOrder = customCategories.length
          ? Math.max(...customCategories.map((c) => c.displayOrder ?? 0))
          : 3;

        await addDoc(collection(db, "categories"), {
          name: categoryName,
          color: color || "",
          displayOrder: maxOrder + 1,
          userId: currentUser?.uid ?? null,
          organizationId: organizationId ?? null,
          organizationName: organizationName ?? null,
        });

        await loadCategories();
        return;
      }

      await updateDoc(doc(db, "categories", category.id), { color: color || "" });
      await loadCategories();
    } catch (err) {
      console.error(err);
      setError("Could not update category color.");
    }
  };

  const persistCustomCategoryOrder = async (orderedCustomCategories) => {
    try {
      await Promise.all(
        orderedCustomCategories.map((category, index) =>
          updateDoc(doc(db, "categories", category.id), {
            displayOrder: index + 4,
          })
        )
      );

      await loadCategories();
    } catch (err) {
      console.error(err);
      setError("Could not update category order.");
    }
  };

  const handleCategoryDragStart = (event, category) => {
    if (fixedCategories.includes(category.name)) return;
    setDraggedCategory(category.name);
    event.dataTransfer.setData("text/plain", category.name);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleCategoryDragOver = (event, category) => {
    if (fixedCategories.includes(category.name)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverCategory(category.name);
  };

  const handleCategoryDrop = async (event, targetCategory) => {
    event.preventDefault();

    const sourceName =
      draggedCategory || event.dataTransfer.getData("text/plain");
    if (!sourceName) return;
    if (sourceName === targetCategory.name) {
      setDraggedCategory(null);
      setDragOverCategory(null);
      return;
    }

    const sourceCategory = customCategories.find((c) => c.name === sourceName);
    const targetCustom = customCategories.find(
      (c) => c.name === targetCategory.name
    );

    if (!sourceCategory || !targetCustom) {
      setDraggedCategory(null);
      setDragOverCategory(null);
      return;
    }

    const updated = [...customCategories];
    const sourceIndex = updated.findIndex((c) => c.name === sourceName);
    const targetIndex = updated.findIndex((c) => c.name === targetCategory.name);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const [removed] = updated.splice(sourceIndex, 1);
    updated.splice(targetIndex, 0, removed);

    setDraggedCategory(null);
    setDragOverCategory(null);

    await persistCustomCategoryOrder(updated);
  };

  const handleCategoryDragEnd = () => {
    setDraggedCategory(null);
    setDragOverCategory(null);
  };

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (activeCategory !== "ALL") {
      result = result.filter(
        (task) => (task.category || "OTHER") === activeCategory
      );
    }

    if (activeView === "ALL_TASKS" && searchTerm.trim() !== "") {
      result = result.filter((task) =>
        (task.title || "").toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return result;
  }, [tasks, activeCategory, activeView, searchTerm]);

  const overdueTasks = useMemo(() => {
    const now = new Date();
    const todayString = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    return filteredTasks.filter((task) => {
      if (!task.dueDate || task.status === "DONE") return false;
      return task.dueDate < todayString;
    });
  }, [filteredTasks]);

  const selectedDateString = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  const formattedSelectedDate = useMemo(() => {
    return selectedDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDate]);

  const selectedDateTasks = useMemo(() => {
    return filteredTasks.filter((task) => task.dueDate === selectedDateString);
  }, [filteredTasks, selectedDateString]);

  const taskDates = useMemo(() => {
    return new Set(tasks.map((task) => task.dueDate));
  }, [tasks]);

  const editingTask = useMemo(() => {
    if (!editingTaskId) return null;
    return tasks.find((task) => task.id === editingTaskId) || null;
  }, [editingTaskId, tasks]);

  const sidebarButtonStyle = (isActive = false) => ({
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    marginBottom: "10px",
    backgroundColor: isActive ? "var(--bg-soft-2)" : "var(--bg-soft)",
    color: "var(--text-main)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  });

  const actionButtonStyle = {
    padding: "7px 12px",
    fontSize: "13px",
    cursor: "pointer",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text-main)",
  };

  const getCategoryRowStyle = (
    category,
    isActive = false,
    isDraggingOver = false
  ) => ({
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    marginBottom: 0,
    backgroundColor: (category.color && category.color !== "#6f6f6f") ? category.color : (isActive ? "var(--bg-soft-2)" : "var(--bg-soft)"),
    color: "var(--text-category)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    cursor: fixedCategories.includes(category.name) ? "pointer" : "grab",
    fontSize: "14px",
    boxShadow: isDraggingOver ? "0 0 0 2px rgba(96,165,250,0.75)" : "none",
    userSelect: "none",
  });

  const selectCategory = (category) => {
    setActiveCategory(category);
    setActiveView("ALL_TASKS");
  };

  const handleCalendarDateClick = (date) => {
    setSelectedDate(date);
  };

  const tileContent = ({ date, view }) => {
    if (view !== "month") return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    if (taskDates.has(dateString)) {
      return (
        <div
          style={{
            marginTop: "4px",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#60a5fa",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        />
      );
    }

    return null;
  };

  const renderTaskRow = (task) => (
    <div key={task.id} className="task-row">
      <div>
        <div className="task-title">
          <strong
            style={{
              textDecoration: task.status === "DONE" ? "line-through" : "none",
              opacity: task.status === "DONE" ? 0.45 : 1,
            }}
          >
            {task.title}
          </strong>
        </div>
        <div
          className="task-meta"
          style={{
            textDecoration: task.status === "DONE" ? "line-through" : "none",
            opacity: task.status === "DONE" ? 0.45 : 1,
          }}
        >
          {(task.category || "OTHER")} • {task.status} • Due: {task.dueDate}
        </div>
        {(task.attachments || []).length > 0 && (
          <div className="attachment-list">
            {(task.attachments || []).map((attachment) => {
              const isEditing =
                editingAttachment?.taskId === task.id &&
                editingAttachment?.attachmentPath === attachment.path;
              const displayLabel =
                attachment.displayName || attachment.name;
              return (
                <div key={attachment.path}>
                  <div className="attachment-item">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="attachment-link"
                    >
                      {displayLabel}
                    </a>
                    {attachment.description && (
                      <span className="attachment-description">
                        {attachment.description}
                      </span>
                    )}
                    <span className="attachment-size">
                      {formatFileSize(attachment.size)}
                    </span>
                    <button
                      type="button"
                      className="attachment-action-btn"
                      onClick={() =>
                        isEditing
                          ? cancelEditAttachment()
                          : startEditAttachment(task.id, attachment)
                      }
                    >
                      {isEditing ? "Close" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="attachment-delete-btn"
                      onClick={() => deleteAttachment(task.id, attachment)}
                    >
                      Delete
                    </button>
                  </div>
                  {isEditing && renderAttachmentEditPanel(task.id, attachment)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="task-actions">
        {task.status !== "DONE" && (
          <button style={actionButtonStyle} onClick={() => markAsDone(task.id)}>
            Done
          </button>
        )}
        <button style={actionButtonStyle} onClick={() => startEditTask(task)}>
          Edit
        </button>
        <button style={actionButtonStyle} onClick={() => deleteTask(task.id)}>
          Delete
        </button>
      </div>
    </div>
  );

  if (authLoading) {
    return <div className={`app-shell ${theme}`} />;
  }

  if (!currentUser) {
    return (
      <div className={`app-shell ${theme}`}>
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className={`app-shell ${theme}`}>

      <div className="sidebar">
        <h1 className="sidebar-title">Inbox</h1>
        <div className="user-bar">
          <span className="user-name">{currentUser.email}</span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>

        {organizationName && (
          <div className="org-context">
            <p className="org-context-label">Organization</p>
            <p className="org-context-name">{organizationName}</p>
            {currentUserRole && (
              <p className="org-context-members" style={{ textTransform: "capitalize" }}>
                Role: {currentUserRole}
              </p>
            )}
          </div>
        )}

        <div className="theme-switch">
          <button
            onClick={() => setTheme("dark")}
            className={`theme-btn ${theme === "dark" ? "active" : ""}`}
          >
            Dark
          </button>
          <button
            onClick={() => setTheme("light")}
            className={`theme-btn ${theme === "light" ? "active" : ""}`}
          >
            Light
          </button>
        </div>

        <button
          onClick={() => {
            resetForm();
            setActiveView("ADD_TASK");
          }}
          style={sidebarButtonStyle(activeView === "ADD_TASK")}
        >
          Add Task
        </button>

        <button
          onClick={() => {
            setActiveCategory("ALL");
            setActiveView("ALL_TASKS");
          }}
          style={sidebarButtonStyle(
            activeView === "ALL_TASKS" && activeCategory === "ALL"
          )}
        >
          All Tasks
        </button>

        <button
          onClick={() => setActiveView("CALENDAR")}
          style={sidebarButtonStyle(activeView === "CALENDAR")}
        >
          Calendar
        </button>

        {currentUserRole === "admin" && organizationId && membershipStatus === "active" && (
          <button
            onClick={() => {
              setInviteError("");
              setInviteSuccess("");
              setActiveView("INVITE_USER");
            }}
            style={sidebarButtonStyle(activeView === "INVITE_USER")}
          >
            Invite User
          </button>
        )}

        {currentUserRole === "admin" && organizationId && membershipStatus === "active" && (
          <button
            onClick={() => {
              setDeptError("");
              setActiveView("MANAGE_DEPARTMENTS");
            }}
            style={sidebarButtonStyle(activeView === "MANAGE_DEPARTMENTS")}
          >
            Departments
          </button>
        )}

        <div className="category-section">
          <h3 className="category-title">Category</h3>

          {showAddCategory && (
            <form
              onSubmit={handleInlineCategorySubmit}
              style={{ marginBottom: "12px", display: "flex", gap: "6px" }}
            >
              <input
                type="text"
                placeholder="New category"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="input-control"
                style={{ flex: 1 }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setShowAddCategory(false);
                  setNewCategoryName("");
                }}
                className="delete-category-btn"
              >
                Delete
              </button>
            </form>
          )}

          {categories.map((category) => {
            const isCustomCategory = !fixedCategories.includes(category.name);
            const isDraggingOver =
              isCustomCategory &&
              dragOverCategory === category.name &&
              draggedCategory !== category.name;

            return (
              <div
                key={category.id ?? category.name}
                style={{ marginBottom: "10px", position: "relative" }}
              >
                <div
                  className="category-row"
                  onContextMenu={(e) => {
                    if (fixedCategories.includes(category.name)) {
                      if (category.name === "OTHER") return;
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu(null);
                      setColorMenuCategory(null);
                      return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu(
                      contextMenu === category.name ? null : category.name
                    );
                    setColorMenuCategory(null);
                  }}
                  onDragOver={(e) => handleCategoryDragOver(e, category)}
                  onDrop={(e) => handleCategoryDrop(e, category)}
                  onDragEnd={handleCategoryDragEnd}
                  style={{ position: "relative" }}
                >
                  <div
                    draggable={isCustomCategory}
                    onDragStart={(e) => handleCategoryDragStart(e, category)}
                    onClick={() => selectCategory(category.name)}
                    onDoubleClick={(e) => {
                      if (!lockedColorCategories.includes(category.name)) {
                        e.stopPropagation();
                        setColorMenuCategory(
                          colorMenuCategory === category.name
                            ? null
                            : category.name
                        );
                        setContextMenu(null);
                      }
                    }}
                    style={{
                      ...getCategoryRowStyle(
                        category,
                        activeCategory === category.name,
                        isDraggingOver
                      ),
                      opacity: draggedCategory === category.name ? 0.55 : 1,
                      transform:
                        draggedCategory === category.name
                          ? "scale(0.98)"
                          : "scale(1)",
                      transition: "0.15s ease",
                    }}
                    title={
                      isCustomCategory
                        ? "Drag to reorder"
                        : !lockedColorCategories.includes(category.name)
                        ? "Double click to change color"
                        : ""
                    }
                  >
                    {category.name.charAt(0) + category.name.slice(1).toLowerCase()}
                  </div>

                  {contextMenu === category.name &&
                    !fixedCategories.includes(category.name) && (
                      <div className="popup-menu">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCategory(category.name);
                          }}
                          className="delete-category-btn"
                          style={{ width: "100%" }}
                        >
                          Delete
                        </button>
                      </div>
                    )}

                  {colorMenuCategory === category.name &&
                    !lockedColorCategories.includes(category.name) && (
                      <div className="popup-menu color-menu">
                        <div className="popup-label">Original</div>

                        <div className="color-grid single">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCategoryColor(category.name, "#6f6f6f");
                              setColorMenuCategory(null);
                            }}
                            className="color-dot"
                            style={{ background: "#6f6f6f" }}
                            title="Use original color"
                          />
                        </div>

                        <div className="popup-label">Colors</div>

                        <div className="color-grid">
                          {categoryColorOptions.map((color) => (
                            <button
                              key={color}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCategoryColor(category.name, color);
                                setColorMenuCategory(null);
                              }}
                              className="color-dot"
                              style={{ background: color }}
                              title="Set category color"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                </div>

                {category.name === "OTHER" && (
                  <div className="other-plus-wrap">
                    <button
                      onClick={() => {
                        setShowAddCategory(true);
                        setNewCategoryName("");
                      }}
                      className="other-plus-btn"
                      title="Add category"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="main-panel">
        {error && <p className="error-text">{error}</p>}

        {activeView === "ADD_TASK" && (
          <div className="panel-card">
            <h2>{editingTaskId ? "Edit Task" : "Add Task"}</h2>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="field-wrap">
                  <input
                    type="text"
                    name="title"
                    placeholder="Task title"
                    value={newTask.title}
                    onChange={(e) => { handleChange(e); setFieldErrors((fe) => ({ ...fe, title: null })); }}
                    className={`input-control wide-input ${fieldErrors.title ? "input-error" : ""}`}
                  />
                  {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
                </div>

                <div className="field-wrap">
                  <input
                    type="date"
                    name="dueDate"
                    value={newTask.dueDate}
                    onChange={(e) => { handleChange(e); setFieldErrors((fe) => ({ ...fe, dueDate: null })); }}
                    className={`input-control ${fieldErrors.dueDate ? "input-error" : ""}`}
                  />
                  {fieldErrors.dueDate && <span className="field-error">{fieldErrors.dueDate}</span>}
                </div>

                <select
                  name="status"
                  value={newTask.status}
                  onChange={handleChange}
                  className="input-control"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="DONE">DONE</option>
                </select>

                <div className="field-wrap">
                  {!useCustomCategory ? (
                    <select
                      name="category"
                      value={newTask.category}
                      onChange={handleChange}
                      className="input-control"
                    >
                      {categories.map((category) => (
                        <option
                          key={category.id ?? category.name}
                          value={category.name}
                        >
                          {category.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="New category"
                        value={customCategory}
                        onChange={(e) => { setCustomCategory(e.target.value); setFieldErrors((fe) => ({ ...fe, category: null })); }}
                        className={`input-control ${fieldErrors.category ? "input-error" : ""}`}
                      />
                      {fieldErrors.category && <span className="field-error">{fieldErrors.category}</span>}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setUseCustomCategory(!useCustomCategory);
                    setCustomCategory("");
                    setFieldErrors((fe) => ({ ...fe, category: null }));
                  }}
                  className="main-btn"
                >
                  {useCustomCategory ? "Use Existing Category" : "New Category"}
                </button>

                <div className="attachment-section">
                  <div className="attachment-section-header">
                    <span className="attachment-label">Attachments</span>
                    <label
                      htmlFor="task-attachments"
                      className="add-attachment-btn"
                      title="Add files"
                    >
                      + Add files
                    </label>
                    <input
                      ref={fileInputRef}
                      id="task-attachments"
                      type="file"
                      multiple
                      onChange={handleAttachmentFileChange}
                      style={{ display: "none" }}
                    />
                  </div>

                  {(editingTask?.attachments || []).length === 0 &&
                    attachmentFiles.length === 0 &&
                    !pendingConfirmFile && (
                      <p className="no-attachments-hint">
                        No attachments yet.
                      </p>
                    )}

                  {(editingTask?.attachments || []).map((attachment) => {
                    const isEditing =
                      editingAttachment?.taskId === editingTask.id &&
                      editingAttachment?.attachmentPath === attachment.path;
                    const displayLabel =
                      attachment.displayName || attachment.name;
                    return (
                      <div key={attachment.path}>
                        <div className="attachment-row">
                          <span className="attachment-badge saved">Saved</span>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="attachment-link"
                          >
                            {displayLabel}
                          </a>
                          {attachment.description && (
                            <span className="attachment-description">
                              {attachment.description}
                            </span>
                          )}
                          <span className="attachment-size">
                            {formatFileSize(attachment.size)}
                          </span>
                          <button
                            type="button"
                            className="attachment-action-btn"
                            onClick={() =>
                              isEditing
                                ? cancelEditAttachment()
                                : startEditAttachment(
                                    editingTask.id,
                                    attachment
                                  )
                            }
                          >
                            {isEditing ? "Close" : "Edit"}
                          </button>
                          <button
                            type="button"
                            className="attachment-delete-btn"
                            onClick={() =>
                              deleteAttachment(editingTask.id, attachment)
                            }
                          >
                            Remove
                          </button>
                        </div>
                        {isEditing &&
                          renderAttachmentEditPanel(editingTask.id, attachment)}
                      </div>
                    );
                  })}

                  {pendingConfirmFile && (
                    <div className="attachment-confirm-panel">
                      <div className="attachment-confirm-header">
                        <span className="attachment-badge selected">Selected file</span>
                        <span className="attachment-confirm-title">Review before uploading</span>
                      </div>
                      <div className="attachment-confirm-details">
                        <div className="attachment-confirm-row">
                          <span className="attachment-confirm-label">File name</span>
                          <span className="attachment-confirm-value">{pendingConfirmFile.name}</span>
                        </div>
                        <div className="attachment-confirm-row">
                          <span className="attachment-confirm-label">File size</span>
                          <span className="attachment-confirm-value">{formatFileSize(pendingConfirmFile.size)}</span>
                        </div>
                        <div className="attachment-confirm-row">
                          <span className="attachment-confirm-label">File type</span>
                          <span className="attachment-confirm-value">{pendingConfirmFile.type || "Unknown"}</span>
                        </div>
                        <div className="attachment-confirm-row">
                          <span className="attachment-confirm-label">Attach to</span>
                          <span className="attachment-confirm-value attachment-confirm-task">
                            {newTask.title.trim() || editingTask?.title || "Untitled task"}
                          </span>
                        </div>
                      </div>
                      <div className="attachment-confirm-actions">
                        <button
                          type="button"
                          className="attachment-confirm-btn"
                          onClick={handleConfirmUpload}
                        >
                          Confirm Upload
                        </button>
                        <button
                          type="button"
                          className="attachment-cancel-btn"
                          onClick={handleCancelPendingFile}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {attachmentFiles.map((file, index) => {
                    const key = `${file.name}-${file.size}-${file.lastModified}`;
                    const status = fileUploadStatuses[key] || "pending";
                    return (
                    <div
                      key={key}
                      className="attachment-row"
                    >
                      {status === "pending" && <span className="attachment-badge pending">Pending</span>}
                      {status === "uploading" && <span className="attachment-badge uploading">Uploading...</span>}
                      {status === "complete" && <span className="attachment-badge complete">Upload complete</span>}
                      {status === "failed" && <span className="attachment-badge failed">Upload failed</span>}
                      <span className="attachment-name">{file.name}</span>
                      <span className="attachment-size">
                        {formatFileSize(file.size)}
                      </span>
                      {(status === "pending" || status === "failed") && (
                        <button
                          type="button"
                          className="attachment-delete-btn"
                          onClick={() => removeSelectedAttachmentFile(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    );
                  })}
                </div>

                <button type="submit" className="main-btn" disabled={loading}>
                  {loading ? "Saving..." : editingTaskId ? "Update" : "Save"}
                </button>

                {editingTaskId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="main-btn"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {activeView === "ALL_TASKS" && (
          <div className="panel-card">
            <h2>{activeCategory === "ALL" ? "All Tasks" : activeCategory}</h2>

            <div className="search-wrap">
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-control search-input"
              />
            </div>

            {overdueTasks.length > 0 && (
              <div className="overdue-box">
                <h3>Overdue</h3>
                {overdueTasks.map((task) => (
                  <div key={task.id} className="overdue-item">
                    <strong>{task.title}</strong>
                    <span> • {(task.category || "OTHER")} • Due: {task.dueDate}</span>
                  </div>
                ))}
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <p>No tasks match your search/category.</p>
            ) : (
              <div>{filteredTasks.map((task) => renderTaskRow(task))}</div>
            )}
          </div>
        )}

        {activeView === "CREATE_ORG" && (
          <div className="panel-card">
            <h2>Welcome to Smart Study Planner</h2>
            <p className="helper-text" style={{ textAlign: "center" }}>
              Your account is not part of any school organization yet.
            </p>

            <div style={{ maxWidth: "480px", margin: "0 auto" }}>
              <div style={{
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "20px",
                marginBottom: "24px",
                background: "var(--bg-soft)",
              }}>
                <p style={{ fontWeight: "600", marginBottom: "8px" }}>Are you a school admin?</p>
                <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "16px" }}>
                  Create your school organization only if you are the school owner or administrator.
                </p>
                <form
                  onSubmit={handleCreateOrg}
                  style={{ display: "flex", flexDirection: "column", gap: "10px" }}
                >
                  <input
                    type="text"
                    placeholder="School name (e.g. Springfield High School)"
                    value={createOrgName}
                    onChange={(e) => { setCreateOrgName(e.target.value); setCreateOrgError(""); }}
                    className="input-control"
                    required
                  />
                  <button type="submit" className="main-btn" disabled={createOrgLoading}>
                    {createOrgLoading ? "Creating..." : "Create School Organization as Admin"}
                  </button>
                </form>
                {createOrgError && (
                  <p style={{ marginTop: "10px", color: "#f87171", fontSize: "13px" }}>
                    {createOrgError}
                  </p>
                )}
              </div>

              <div style={{
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "20px",
                background: "var(--bg-soft)",
              }}>
                <p style={{ fontWeight: "600", marginBottom: "8px" }}>Are you a teacher or student?</p>
                <p style={{ fontSize: "13px", color: "var(--text-soft)" }}>
                  Ask your school admin to invite your account. Once they do, you will see an
                  Accept button here the next time you sign in.
                </p>
                <button
                  className="main-btn"
                  style={{ marginTop: "12px" }}
                  onClick={handleLogout}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === "PENDING_MEMBERSHIP" && pendingInvitation && (
          <div className="panel-card">
            <h2>You have a pending invitation</h2>
            <p className="helper-text">
              You have been invited to join an organization. Review and accept to get started.
            </p>

            <div style={{
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "24px",
              background: "var(--bg-soft)",
              maxWidth: "480px",
              marginTop: "20px",
            }}>
              <p style={{ fontWeight: "600", marginBottom: "8px", fontSize: "16px" }}>
                {pendingInvitation.organizationName || pendingInvitation.organizationId}
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "4px" }}>
                Role: <strong style={{ color: "var(--text-main)", textTransform: "capitalize" }}>{pendingInvitation.role}</strong>
              </p>
              {pendingInvitation.departmentName && (
                <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "4px" }}>
                  Department: <strong style={{ color: "var(--text-main)" }}>{pendingInvitation.departmentName}</strong>
                </p>
              )}
              <p style={{ fontSize: "13px", color: "var(--text-soft)", marginBottom: "4px" }}>
                Invited by: <strong style={{ color: "var(--text-main)" }}>{pendingInvitation.createdByEmail}</strong>
              </p>
              {error && (
                <p style={{ color: "#f87171", fontSize: "13px", marginTop: "8px" }}>{error}</p>
              )}
              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button className="main-btn" onClick={handleAcceptMembership}>
                  Accept Invitation
                </button>
                <button
                  className="main-btn"
                  style={{ background: "var(--bg-soft)", border: "1px solid var(--border)" }}
                  onClick={handleLogout}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === "INVITE_USER" && currentUserRole === "admin" && membershipStatus === "active" && (
          <div className="panel-card">
            <h2>Invite User</h2>
            <p className="helper-text">
              Invite a teacher or student to join <strong>{organizationName}</strong>.
              The user must have already signed up. They will see an Accept button the next time they sign in.
            </p>

            <form onSubmit={handleInviteUser} style={{ maxWidth: "480px", display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
              <div className="field-wrap">
                <label style={{ display: "block", fontSize: "13px", marginBottom: "4px", color: "var(--text-soft)" }}>
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); setInviteSuccess(""); }}
                  className="input-control"
                  required
                />
              </div>

              <div className="field-wrap">
                <label style={{ display: "block", fontSize: "13px", marginBottom: "4px", color: "var(--text-soft)" }}>
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="input-control"
                >
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                </select>
              </div>

              <div className="field-wrap">
                <label style={{ display: "block", fontSize: "13px", marginBottom: "4px", color: "var(--text-soft)" }}>
                  Department (optional)
                </label>
                <select
                  value={inviteDepartmentId}
                  onChange={(e) => setInviteDepartmentId(e.target.value)}
                  className="input-control"
                >
                  <option value="">None</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
                {departments.length === 0 && (
                  <p style={{ fontSize: "12px", color: "var(--text-soft)", marginTop: "4px" }}>
                    No departments yet.{" "}
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: "12px" }}
                      onClick={() => setActiveView("MANAGE_DEPARTMENTS")}
                    >
                      Create one in Departments.
                    </button>
                  </p>
                )}
              </div>

              {inviteError && (
                <p style={{ color: "#f87171", fontSize: "13px" }}>{inviteError}</p>
              )}
              {inviteSuccess && (
                <p style={{ color: "#4ade80", fontSize: "13px" }}>{inviteSuccess}</p>
              )}

              <button type="submit" className="main-btn" disabled={inviteLoading}>
                {inviteLoading ? "Sending..." : "Send Invitation"}
              </button>
            </form>
          </div>
        )}

        {activeView === "MANAGE_DEPARTMENTS" && currentUserRole === "admin" && membershipStatus === "active" && (
          <div className="panel-card">
            <h2>Departments</h2>
            <p className="helper-text">
              Manage departments for <strong>{organizationName}</strong>.
            </p>

            <form onSubmit={handleCreateDepartment} style={{ maxWidth: "480px", display: "flex", gap: "10px", marginTop: "16px", marginBottom: "24px" }}>
              <input
                type="text"
                placeholder="New department name"
                value={newDeptName}
                onChange={(e) => { setNewDeptName(e.target.value); setDeptError(""); }}
                className="input-control"
                style={{ flex: 1 }}
              />
              <button type="submit" className="main-btn" disabled={deptLoading}>
                {deptLoading ? "Creating..." : "Add"}
              </button>
            </form>

            {deptError && (
              <p style={{ color: "#f87171", fontSize: "13px", marginBottom: "12px" }}>{deptError}</p>
            )}

            {departments.length === 0 ? (
              <p style={{ color: "var(--text-soft)", fontSize: "14px" }}>No departments yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "480px" }}>
                {departments.map((dept) => (
                  <div
                    key={dept.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      background: "var(--bg-soft)",
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>{dept.name}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-soft)" }}>{dept.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === "CALENDAR" && (
          <div className="panel-card">
            <h2>
              {activeCategory === "ALL"
                ? "Calendar"
                : `${activeCategory} Calendar`}
            </h2>

            <p className="helper-text">
              Click a date to see tasks for that day.
            </p>

            <div className="calendar-wrap">
              <Calendar
                onChange={handleCalendarDateClick}
                value={selectedDate}
                tileContent={tileContent}
              />
            </div>

            <div>
              <h3>Tasks for {formattedSelectedDate}</h3>

              {selectedDateTasks.length === 0 ? (
                <p>No tasks on this date.</p>
              ) : (
                <div>{selectedDateTasks.map((task) => renderTaskRow(task))}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;