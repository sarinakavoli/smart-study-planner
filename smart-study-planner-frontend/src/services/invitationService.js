import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Invites an existing user by writing invite fields directly to their users/{uid} document.
 * No invitations collection is used.
 *
 * Fields written to the target user's doc (via updateDoc — unchanged fields are untouched):
 *   membershipStatus: "pending"
 *   organizationId, organizationName, role, departmentId, departmentName
 *   invitedBy, invitedByEmail, invitedAt, updatedAt
 *
 * @returns {Promise<string>} the target user's UID
 */
export async function inviteUserByEmail({
  adminUid,
  adminEmail,
  adminOrgId,
  adminOrgName,
  inviteeEmail,
  role,
  departmentId = null,
  departmentName = null,
}) {
  const email = inviteeEmail.trim().toLowerCase();

  // ── Diagnostic 1–3: read admin's own Firestore doc ─────────────────────────
  const adminDocSnap = await getDoc(doc(db, "users", adminUid));
  const adminDocData = adminDocSnap.exists() ? adminDocSnap.data() : null;
  console.log("[invite:diag] 1. adminUid                  :", adminUid);
  console.log("[invite:diag] 2. adminEmail                :", adminEmail);
  console.log("[invite:diag] 3. admin users/{uid} doc     :", JSON.stringify(adminDocData));
  console.log("[invite:diag] 4. target email              :", email);

  // ── Condition checks ────────────────────────────────────────────────────────
  console.log("[invite:diag]    --- condition checks ---");
  console.log("[invite:diag]    admin.role                :", adminDocData?.role, "| expected: 'admin' |", adminDocData?.role === "admin" ? "✓" : "✗ FAIL");
  console.log("[invite:diag]    admin.membershipStatus    :", adminDocData?.membershipStatus ?? "(field missing)", "| expected: 'active' |", adminDocData?.membershipStatus === "active" ? "✓" : "✗ FAIL (or old schema without field — handled by isActiveAdmin)");
  console.log("[invite:diag]    admin.organizationId      :", adminDocData?.organizationId ?? "(null)", "| not null:", adminDocData?.organizationId != null ? "✓" : "✗ FAIL");
  console.log("[invite:diag]    adminOrgId matches doc    :", adminOrgId, "===", adminDocData?.organizationId, "|", adminOrgId === adminDocData?.organizationId ? "✓" : "✗ FAIL");

  // ── Diagnostic 5–6: find and read target user ───────────────────────────────
  const q = query(collection(db, "users"), where("email", "==", email));
  const snapshot = await getDocs(q);
  const targetExists = !snapshot.empty;
  console.log("[invite:diag] 5. target doc found          :", targetExists ? "yes" : "NO — user must sign up first");

  if (!targetExists) {
    throw new Error("No account found with that email. The user must sign up first.");
  }

  const targetDoc = snapshot.docs[0];
  const targetData = targetDoc.data();
  console.log("[invite:diag] 5. target user doc id        :", targetDoc.id);
  console.log("[invite:diag] 6. target user doc data      :", JSON.stringify(targetData));
  console.log("[invite:diag]    target.membershipStatus   :", targetData.membershipStatus, "| in ['not_invited','pending']:", ["not_invited", "pending"].includes(targetData.membershipStatus) ? "✓" : "✗ FAIL");
  console.log("[invite:diag]    target.email in doc       :", targetData.email, "| matches invite email:", targetData.email === email ? "✓" : "✗ MISMATCH");

  if (targetData.membershipStatus === "active") {
    throw new Error("This user already belongs to an organization.");
  }

  // ── Optional: verify departmentId exists in Firestore ───────────────────────
  if (departmentId) {
    const deptSnap = await getDoc(doc(db, "organizations", adminOrgId, "departments", departmentId));
    console.log("[invite:diag]    departmentId exists      :", deptSnap.exists() ? "✓ " + departmentId : "✗ NOT FOUND — " + departmentId);
  } else {
    console.log("[invite:diag]    departmentId             : (none selected)");
  }

  // ── Build update payload ────────────────────────────────────────────────────
  const inviteFields = {
    membershipStatus: "pending",
    organizationId: adminOrgId,
    organizationName: adminOrgName ?? null,
    role,
    departmentId: departmentId ?? null,
    departmentName: departmentName ?? null,
    invitedBy: adminUid,
    invitedByEmail: adminEmail,
    invitedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const expectedDocAfter = {
    ...targetData,
    ...inviteFields,
    invitedAt: "(serverTimestamp)",
    updatedAt: "(serverTimestamp)",
  };

  console.log("[invite:diag] 7. update data (updateDoc)   :", JSON.stringify({ ...inviteFields, invitedAt: "(serverTimestamp)", updatedAt: "(serverTimestamp)" }));
  console.log("[invite:diag] 8. expected doc after update :", JSON.stringify(expectedDocAfter));
  console.log("[invite:diag]    --- writing to users/", targetDoc.id, " ---");

  // updateDoc only sends the fields listed — email, displayName, createdAt, etc. are untouched.
  await updateDoc(doc(db, "users", targetDoc.id), inviteFields);
  return targetDoc.id;
}

/**
 * Accepts a pending membership invitation.
 * Only writes membershipStatus: "active" + timestamps to the user's own doc.
 * All org fields (organizationId, role, etc.) were already set by the admin.
 *
 * @param {string} uid  The accepting user's UID
 */
export async function acceptMembership(uid) {
  console.log("[invitationService] acceptMembership — writing to users/", uid);
  await updateDoc(doc(db, "users", uid), {
    membershipStatus: "active",
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
