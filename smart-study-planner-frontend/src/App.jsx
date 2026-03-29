import { useEffect, useMemo, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./App.css";

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
    "#f8b4c6",
    "#f5c2e7",
    "#f9a8d4",
    "#fecaca",
    "#f0abfc",
    "#f9c7a1",
    "#fdba74",
    "#fde68a",
    "#fde047",
    "#c7f0bd",
    "#86efac",
    "#b8f2e6",
    "#99f6e4",
    "#bfdbfe",
    "#93c5fd",
    "#c7d2fe",
    "#a5b4fc",
    "#c4b5fd",
  ];

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const loadTasks = async () => {
    try {
      setError("");
      const response = await fetch("/api/tasks", {
        cache: "no-store",
      });

      if (!response.ok) throw new Error("Failed to fetch tasks");
      const data = await response.json();
      setTasks(data);
    } catch (err) {
      console.error(err);
      setError("Could not connect to backend.");
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch("/api/categories", {
        cache: "no-store",
      });

      if (!response.ok) throw new Error("Failed to fetch categories");
      const data = await response.json();
      setCategoriesData(data);
    } catch (err) {
      console.error(err);
      setError("Could not load categories.");
    }
  };

  useEffect(() => {
    loadTasks();
    loadCategories();
  }, []);

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
          color: "#6f6f6f",
          displayOrder: index + 1,
        });
      }
    });

    fixedBottom.forEach((name) => {
      if (!byName.has(name)) {
        byName.set(name, {
          id: `fixed-${name}`,
          name,
          color: "#6f6f6f",
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
  };

  const createCategoryInBackend = async (name) => {
    const normalizedName = name.trim().toUpperCase();
    if (!normalizedName) return normalizedName;

    const exists = getCategoryByName(normalizedName);
    if (exists) return normalizedName;

    const maxOrder = customCategories.length
      ? Math.max(...customCategories.map((c) => c.displayOrder ?? 0))
      : 3;

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: normalizedName,
        color: "#6f6f6f",
        displayOrder: maxOrder + 1,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create category");
    }

    await loadCategories();
    return normalizedName;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setError("");

      let finalCategory = useCustomCategory
        ? customCategory.trim().toUpperCase()
        : newTask.category;

      if (!finalCategory) throw new Error("Category is required");

      if (!fixedCategories.includes(finalCategory)) {
        finalCategory = await createCategoryInBackend(finalCategory);
      }

      const payload = {
        ...newTask,
        description: "",
        category: finalCategory,
        courseId: 1,
      };

      const url = editingTaskId
        ? `/api/tasks/${editingTaskId}`
        : "/api/tasks";

      const method = editingTaskId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          editingTaskId ? "Failed to update task" : "Failed to create task"
        );
      }

      resetForm();
      setActiveView("ALL_TASKS");
      loadTasks();
      loadCategories();
    } catch (err) {
      console.error(err);
      setError(editingTaskId ? "Could not update task." : "Could not create task.");
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

      const response = await fetch(
        `/api/tasks/${taskId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "DONE" }),
        }
      );

      if (!response.ok) throw new Error("Failed to update task.");

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

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete task.");

      loadTasks();
    } catch (err) {
      console.error(err);
      setError("Could not delete task.");
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

      await fetch("/api/tasks/category/move-to-other", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ oldCategory: categoryName }),
      });

      const category = getCategoryByName(categoryName);
      if (category?.id && !String(category.id).startsWith("fixed-")) {
        const response = await fetch(
          `/api/categories/${category.id}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) throw new Error("Failed to delete category.");
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

        const createRes = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: categoryName,
            color: color || "#6f6f6f",
            displayOrder: maxOrder + 1,
          }),
        });

        if (!createRes.ok) throw new Error("Failed to create category in backend.");

        await loadCategories();
        return;
      }

      const response = await fetch(
        `/api/categories/${category.id}/color`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ color: color || "#6f6f6f" }),
        }
      );

      if (!response.ok) throw new Error("Failed to update color.");

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
          fetch(`/api/categories/${category.id}/order`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ displayOrder: index + 4 }),
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
    backgroundColor: category.color || (isActive ? "var(--bg-soft-2)" : "var(--bg-soft)"),
    color: "var(--text-main)",
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
              opacity: task.status === "DONE" ? 0.7 : 1,
            }}
          >
            {task.title}
          </strong>
        </div>
        <div
          className="task-meta"
          style={{
            textDecoration: task.status === "DONE" ? "line-through" : "none",
            opacity: task.status === "DONE" ? 0.7 : 1,
          }}
        >
          {(task.category || "OTHER")} • {task.status} • Due: {task.dueDate}
        </div>
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

  return (
    <div className={`app-shell ${theme}`}>
      <div className="sidebar">
        <h1 className="sidebar-title">Inbox</h1>

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
                <input
                  type="text"
                  name="title"
                  placeholder="Task title"
                  value={newTask.title}
                  onChange={handleChange}
                  required
                  className="input-control wide-input"
                />

                <input
                  type="date"
                  name="dueDate"
                  value={newTask.dueDate}
                  onChange={handleChange}
                  required
                  className="input-control"
                />

                <select
                  name="status"
                  value={newTask.status}
                  onChange={handleChange}
                  className="input-control"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="DONE">DONE</option>
                </select>

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
                  <input
                    type="text"
                    placeholder="New category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="input-control"
                    required
                  />
                )}

                <button
                  type="button"
                  onClick={() => {
                    setUseCustomCategory(!useCustomCategory);
                    setCustomCategory("");
                  }}
                  className="main-btn"
                >
                  {useCustomCategory ? "Use Existing Category" : "New Category"}
                </button>

                <button type="submit" className="main-btn">
                  {editingTaskId ? "Update" : "Save"}
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