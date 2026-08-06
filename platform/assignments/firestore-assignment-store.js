'use strict';

function createFirestoreAssignmentStore({ db, sdk } = {}) {
  if (!db || !sdk) throw new TypeError('Firestore db and SDK are required.');
  const assignmentRef = id => sdk.doc(db, 'assignments', id);
  const observationRef = id => sdk.doc(db, 'observations', id);
  const value = snapshot => snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  return Object.freeze({
    deleteValue: () => sdk.deleteField(),
    getAssignment: async id => value(await sdk.getDoc(assignmentRef(id))),
    runTransaction: work => sdk.runTransaction(db, async transaction => work({
      getAssignment: async id => value(await transaction.get(assignmentRef(id))),
      getObservation: async id => value(await transaction.get(observationRef(id))),
      createAssignment: async assignment => transaction.set(assignmentRef(assignment.assignmentId), assignment),
      updateAssignment: async (id, patch) => transaction.update(assignmentRef(id), patch),
      updateObservation: async (id, patch) => transaction.update(observationRef(id), patch),
    })),
  });
}

module.exports = Object.freeze({ createFirestoreAssignmentStore });
