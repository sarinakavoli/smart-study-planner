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
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import {
  personalOrgId,
  generateTaskId,
  generateCategoryId,
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
import { loadUserTasks } from "./services/taskService";

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
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [attachmentFiles, setAttachmentFiles] = useState([]);
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
        console.log("[auth] onAuthStateChanged fired — uid:", firebaseUser.uid, "email:", firebaseUser.email);

        const userRef = doc(db, "users", firebaseUser.uid);
        let resolvedOrgId = null;

        // ── Step 1: read existing user document ──────────────────────────────
        let existingData = null;
        try {
          console.log("[auth] Step 1 — reading users/", firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          existingData = userSnap.exists() ? userSnap.data() : null;
          console.log("[auth] Step 1 — user doc exists:", userSnap.exists(), "| organizationId:", existingData?.organizationId ?? "(none)");
        } catch (err) {
          console.error("[auth] Step 1 FAILED — could not read user doc:", err.code, err.message);
        }

        // Use existing organizationId if present, otherwise generate a new one.
        resolvedOrgId = existingData?.organizationId ?? personalOrgId(firebaseUser.uid, firebaseUser.email);

        // ── Step 2: ensure the organization document exists ──────────────────
        // Always run this step so that accounts whose org doc was never created
        // (e.g. due to a past permission error) are self-healed on next login.
        try {
          const orgRef = doc(db, "organizations", resolvedOrgId);
          const orgPayload = {
            id: resolvedOrgId,
            readableId: resolvedOrgId,
            name: `${firebaseUser.email || ""}'s Workspace`,
            ownerId: firebaseUser.uid,
            ownerEmail: firebaseUser.email || "",
            memberIds: [firebaseUser.uid],
            memberEmails: [firebaseUser.email || ""],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          console.log("[auth] org payload", orgPayload);
          await setDoc(orgRef, orgPayload, { merge: true });
          console.log("[auth] organizations/", resolvedOrgId, "written OK");
        } catch (err) {
          console.error("[auth] organizations write failed:", err.code, err.message, err);
        }

        // ── Step 3: write or refresh the user document ───────────────────────
        if (!existingData?.organizationId) {
          // New user — write the full document for the first time.
          console.log("[auth] Step 3 — writing users/", firebaseUser.uid, "for the first time");
          try {
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName ?? null,
              organizationId: resolvedOrgId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            console.log("[auth] Step 3 — users/", firebaseUser.uid, "written OK");
          } catch (err) {
            console.error("[auth] Step 3 FAILED — could not write user doc:", err.code, err.message, err);
          }
        } else {
          // Returning user — refresh mutable fields only.
          console.log("[auth] Step 3 — returning user, merging into users/", firebaseUser.uid);
          try {
            await setDoc(
              userRef,
              {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName ?? null,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
            console.log("[auth] Step 3 — users/", firebaseUser.uid, "merge-updated OK");
          } catch (err) {
            console.error("[auth] Step 3 FAILED — could not merge-update user doc:", err.code, err.message, err);
          }
        }

        console.log("[auth] Setup complete — resolvedOrgId:", resolvedOrgId);
        setOrganizationId(resolvedOrgId);
        setOrganizationName(`${firebaseUser.email || ""}'s Workspace`);
      } else {
        console.log("[auth] onAuthStateChanged fired — user signed out");
        setOrganizationId(null);
        setOrganizationName(null);
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

  const loadTasks = async () => {
    try {
      setError("");

      if (!currentUser?.uid) {
        setTasks([]);
        return;
      }

      const data = await loadUserTasks(currentUser.uid);
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
      const q = query(
        collection(db, "categories"),
        where("userId", "==", currentUser.uid)
      );
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
  };

  useEffect(() => {
    if (currentUser) {
      loadTasks();
      loadCategories();
    }
  }, [currentUser]);

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

    setAttachmentFiles((prev) => {
      const existingKeys = new Set(
        prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`)
      );
      const toAdd = newFiles.filter(
        (f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`)
      );
      return [...prev, ...toAdd];
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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

    const orgId = organizationId ?? personalOrgId(currentUser.uid, currentUser.email);
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

      const orgId = organizationId ?? personalOrgId(currentUser.uid, currentUser.email);

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
        try {
          await uploadTaskAttachments(taskId, attachmentFiles);
        } catch (uploadErr) {
          console.error(uploadErr);
          attachmentUploadFailed = true;
        }
      }

      resetForm();
      setActiveView("ALL_TASKS");
      loadTasks();
      loadCategories();
      if (attachmentUploadFailed) {
        setError("The task was saved, but one or more attachments could not be uploaded.");
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
                    attachmentFiles.length === 0 && (
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

                  {attachmentFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="attachment-row"
                    >
                      <span className="attachment-badge pending">Pending</span>
                      <span className="attachment-name">{file.name}</span>
                      <span className="attachment-size">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        type="button"
                        className="attachment-delete-btn"
                        onClick={() => removeSelectedAttachmentFile(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
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