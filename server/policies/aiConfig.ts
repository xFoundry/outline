import { AIConfig, User, Team } from "@server/models";
import { allow } from "./cancan";
import { and, isTeamModel, isTeamMutable } from "./utils";

// Allow admins to read AI config
allow(User, "read", AIConfig, (actor, aiConfig) =>
  and(
    //
    isTeamModel(actor, aiConfig),
    actor.isAdmin
  )
);

// Allow admins to update AI config
allow(User, "update", AIConfig, (actor, aiConfig) =>
  and(
    //
    isTeamModel(actor, aiConfig),
    isTeamMutable(actor),
    actor.isAdmin
  )
);

// Allow team members to use AI (based on permissions in config)
allow(User, "useAI", Team, (actor, team) => {
  if (!isTeamModel(actor, team)) {
    return false;
  }
  if (actor.isSuspended || actor.isGuest) {
    return false;
  }
  return true;
});
