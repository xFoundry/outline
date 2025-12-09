import { AIConversation, User } from "@server/models";
import { allow } from "./cancan";
import { and, isOwner, isTeamModel } from "./utils";

// Users can read their own conversations
allow(User, "read", AIConversation, (actor, conversation) =>
  and(
    //
    isTeamModel(actor, conversation),
    isOwner(actor, conversation),
    !actor.isSuspended
  )
);

// Users can update their own conversations
allow(User, "update", AIConversation, (actor, conversation) =>
  and(
    //
    isTeamModel(actor, conversation),
    isOwner(actor, conversation),
    !actor.isSuspended
  )
);

// Users can delete their own conversations
allow(User, "delete", AIConversation, (actor, conversation) =>
  and(
    //
    isTeamModel(actor, conversation),
    isOwner(actor, conversation),
    !actor.isSuspended
  )
);
