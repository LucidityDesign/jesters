#!/usr/bin/env bash
# Prepares the Firebase project for a deploy, as far as the deploy account is allowed to:
# enables the APIs, creates Firestore in europe-west3 and turns on anonymous sign-in.
# Everything is idempotent. What the account may not do is reported with the manual step.
#
# Needs: PROJECT_ID, a signed-in gcloud (the CI auth step), curl and jq.
set -uo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
REGION=europe-west3
problems=0

note() { echo "✔ $*"; }
problem() {
  echo "::error::$*"
  problems=$((problems + 1))
}

token=$(gcloud auth print-access-token) || { echo "::error::gcloud is not signed in."; exit 1; }
api() { curl -sS -H "Authorization: Bearer $token" -H "Content-Type: application/json" "$@"; }

# 1. APIs (firebase deploy would enable most of them too, but fails less clearly).
apis=(
  firebase.googleapis.com firestore.googleapis.com identitytoolkit.googleapis.com
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
  run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com cloudscheduler.googleapis.com
  firebasehosting.googleapis.com firebaserules.googleapis.com firebaseappcheck.googleapis.com
  fcm.googleapis.com
)
if output=$(gcloud services enable "${apis[@]}" --project "$PROJECT_ID" 2>&1); then
  note "APIs enabled"
elif grep -qi billing <<<"$output"; then
  problem "The project needs the Blaze plan: Firebase console → Usage and billing → Modify plan."
else
  echo "$output"
  echo "::warning::Could not enable the APIs (the deploy will try again). Give the deploy account the role 'Service Usage Admin' if it fails."
fi

# 2. Firestore (default) database in Frankfurt, next to the functions.
location=$(gcloud firestore databases describe --database="(default)" --project "$PROJECT_ID" \
  --format="value(locationId)" 2>/dev/null)
if [ -z "$location" ]; then
  if gcloud firestore databases create --database="(default)" --location="$REGION" \
    --type=firestore-native --project "$PROJECT_ID" >/dev/null 2>&1; then
    note "Firestore created in $REGION"
  else
    problem "Create Firestore: Firebase console → Firestore Database → Create database, location $REGION (Frankfurt), production mode."
  fi
elif [ "$location" != "$REGION" ]; then
  problem "Firestore is in $location, but the functions run in $REGION. A database location can't be changed; use a new project or change REGION in backend/functions/src/setup.ts and ios/…/Backend.swift."
else
  note "Firestore is in $REGION"
fi

# 3. Anonymous sign-in (the only sign-in method the apps use).
config_url="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT_ID/config"
if api "$config_url" | jq -e '.signIn.anonymous.enabled == true' >/dev/null 2>&1; then
  note "Anonymous sign-in is on"
elif api -X PATCH "$config_url?updateMask=signIn.anonymous.enabled" \
  -d '{"signIn":{"anonymous":{"enabled":true}}}' | jq -e '.signIn.anonymous.enabled == true' >/dev/null 2>&1; then
  note "Anonymous sign-in turned on"
else
  problem "Turn on anonymous sign-in: Firebase console → Authentication → Get started → Sign-in method → Anonymous."
fi

if [ "$problems" -gt 0 ]; then
  echo "::error::The project is not ready for the deploy ($problems step(s) above)."
  exit 1
fi
