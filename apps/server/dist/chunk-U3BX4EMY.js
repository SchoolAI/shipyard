import {
  __commonJS,
  __toESM
} from "./chunk-JSBRDJBE.js";

// ../../node_modules/.pnpm/lz-string@1.5.0/node_modules/lz-string/libs/lz-string.js
var require_lz_string = __commonJS({
  "../../node_modules/.pnpm/lz-string@1.5.0/node_modules/lz-string/libs/lz-string.js"(exports, module) {
    "use strict";
    var LZString = (function() {
      var f = String.fromCharCode;
      var keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      var keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
      var baseReverseDic = {};
      function getBaseValue(alphabet, character) {
        if (!baseReverseDic[alphabet]) {
          baseReverseDic[alphabet] = {};
          for (var i = 0; i < alphabet.length; i++) {
            baseReverseDic[alphabet][alphabet.charAt(i)] = i;
          }
        }
        return baseReverseDic[alphabet][character];
      }
      var LZString2 = {
        compressToBase64: function(input) {
          if (input == null) return "";
          var res = LZString2._compress(input, 6, function(a) {
            return keyStrBase64.charAt(a);
          });
          switch (res.length % 4) {
            // To produce valid Base64
            default:
            // When could this happen ?
            case 0:
              return res;
            case 1:
              return res + "===";
            case 2:
              return res + "==";
            case 3:
              return res + "=";
          }
        },
        decompressFromBase64: function(input) {
          if (input == null) return "";
          if (input == "") return null;
          return LZString2._decompress(input.length, 32, function(index) {
            return getBaseValue(keyStrBase64, input.charAt(index));
          });
        },
        compressToUTF16: function(input) {
          if (input == null) return "";
          return LZString2._compress(input, 15, function(a) {
            return f(a + 32);
          }) + " ";
        },
        decompressFromUTF16: function(compressed) {
          if (compressed == null) return "";
          if (compressed == "") return null;
          return LZString2._decompress(compressed.length, 16384, function(index) {
            return compressed.charCodeAt(index) - 32;
          });
        },
        //compress into uint8array (UCS-2 big endian format)
        compressToUint8Array: function(uncompressed) {
          var compressed = LZString2.compress(uncompressed);
          var buf = new Uint8Array(compressed.length * 2);
          for (var i = 0, TotalLen = compressed.length; i < TotalLen; i++) {
            var current_value = compressed.charCodeAt(i);
            buf[i * 2] = current_value >>> 8;
            buf[i * 2 + 1] = current_value % 256;
          }
          return buf;
        },
        //decompress from uint8array (UCS-2 big endian format)
        decompressFromUint8Array: function(compressed) {
          if (compressed === null || compressed === void 0) {
            return LZString2.decompress(compressed);
          } else {
            var buf = new Array(compressed.length / 2);
            for (var i = 0, TotalLen = buf.length; i < TotalLen; i++) {
              buf[i] = compressed[i * 2] * 256 + compressed[i * 2 + 1];
            }
            var result = [];
            buf.forEach(function(c) {
              result.push(f(c));
            });
            return LZString2.decompress(result.join(""));
          }
        },
        //compress into a string that is already URI encoded
        compressToEncodedURIComponent: function(input) {
          if (input == null) return "";
          return LZString2._compress(input, 6, function(a) {
            return keyStrUriSafe.charAt(a);
          });
        },
        //decompress from an output of compressToEncodedURIComponent
        decompressFromEncodedURIComponent: function(input) {
          if (input == null) return "";
          if (input == "") return null;
          input = input.replace(/ /g, "+");
          return LZString2._decompress(input.length, 32, function(index) {
            return getBaseValue(keyStrUriSafe, input.charAt(index));
          });
        },
        compress: function(uncompressed) {
          return LZString2._compress(uncompressed, 16, function(a) {
            return f(a);
          });
        },
        _compress: function(uncompressed, bitsPerChar, getCharFromInt) {
          if (uncompressed == null) return "";
          var i, value, context_dictionary = {}, context_dictionaryToCreate = {}, context_c = "", context_wc = "", context_w = "", context_enlargeIn = 2, context_dictSize = 3, context_numBits = 2, context_data = [], context_data_val = 0, context_data_position = 0, ii;
          for (ii = 0; ii < uncompressed.length; ii += 1) {
            context_c = uncompressed.charAt(ii);
            if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
              context_dictionary[context_c] = context_dictSize++;
              context_dictionaryToCreate[context_c] = true;
            }
            context_wc = context_w + context_c;
            if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
              context_w = context_wc;
            } else {
              if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                if (context_w.charCodeAt(0) < 256) {
                  for (i = 0; i < context_numBits; i++) {
                    context_data_val = context_data_val << 1;
                    if (context_data_position == bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                  }
                  value = context_w.charCodeAt(0);
                  for (i = 0; i < 8; i++) {
                    context_data_val = context_data_val << 1 | value & 1;
                    if (context_data_position == bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value = value >> 1;
                  }
                } else {
                  value = 1;
                  for (i = 0; i < context_numBits; i++) {
                    context_data_val = context_data_val << 1 | value;
                    if (context_data_position == bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value = 0;
                  }
                  value = context_w.charCodeAt(0);
                  for (i = 0; i < 16; i++) {
                    context_data_val = context_data_val << 1 | value & 1;
                    if (context_data_position == bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value = value >> 1;
                  }
                }
                context_enlargeIn--;
                if (context_enlargeIn == 0) {
                  context_enlargeIn = Math.pow(2, context_numBits);
                  context_numBits++;
                }
                delete context_dictionaryToCreate[context_w];
              } else {
                value = context_dictionary[context_w];
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = context_data_val << 1 | value & 1;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = value >> 1;
                }
              }
              context_enlargeIn--;
              if (context_enlargeIn == 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
              }
              context_dictionary[context_wc] = context_dictSize++;
              context_w = String(context_c);
            }
          }
          if (context_w !== "") {
            if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
              if (context_w.charCodeAt(0) < 256) {
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = context_data_val << 1;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                }
                value = context_w.charCodeAt(0);
                for (i = 0; i < 8; i++) {
                  context_data_val = context_data_val << 1 | value & 1;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = value >> 1;
                }
              } else {
                value = 1;
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = context_data_val << 1 | value;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = 0;
                }
                value = context_w.charCodeAt(0);
                for (i = 0; i < 16; i++) {
                  context_data_val = context_data_val << 1 | value & 1;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = value >> 1;
                }
              }
              context_enlargeIn--;
              if (context_enlargeIn == 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
              }
              delete context_dictionaryToCreate[context_w];
            } else {
              value = context_dictionary[context_w];
              for (i = 0; i < context_numBits; i++) {
                context_data_val = context_data_val << 1 | value & 1;
                if (context_data_position == bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }
            }
            context_enlargeIn--;
            if (context_enlargeIn == 0) {
              context_enlargeIn = Math.pow(2, context_numBits);
              context_numBits++;
            }
          }
          value = 2;
          for (i = 0; i < context_numBits; i++) {
            context_data_val = context_data_val << 1 | value & 1;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
          while (true) {
            context_data_val = context_data_val << 1;
            if (context_data_position == bitsPerChar - 1) {
              context_data.push(getCharFromInt(context_data_val));
              break;
            } else context_data_position++;
          }
          return context_data.join("");
        },
        decompress: function(compressed) {
          if (compressed == null) return "";
          if (compressed == "") return null;
          return LZString2._decompress(compressed.length, 32768, function(index) {
            return compressed.charCodeAt(index);
          });
        },
        _decompress: function(length, resetValue, getNextValue) {
          var dictionary = [], next, enlargeIn = 4, dictSize = 4, numBits = 3, entry = "", result = [], i, w, bits, resb, maxpower, power, c, data = { val: getNextValue(0), position: resetValue, index: 1 };
          for (i = 0; i < 3; i += 1) {
            dictionary[i] = i;
          }
          bits = 0;
          maxpower = Math.pow(2, 2);
          power = 1;
          while (power != maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          switch (next = bits) {
            case 0:
              bits = 0;
              maxpower = Math.pow(2, 8);
              power = 1;
              while (power != maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position == 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index++);
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              c = f(bits);
              break;
            case 1:
              bits = 0;
              maxpower = Math.pow(2, 16);
              power = 1;
              while (power != maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position == 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index++);
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              c = f(bits);
              break;
            case 2:
              return "";
          }
          dictionary[3] = c;
          w = c;
          result.push(c);
          while (true) {
            if (data.index > length) {
              return "";
            }
            bits = 0;
            maxpower = Math.pow(2, numBits);
            power = 1;
            while (power != maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position == 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
              }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            switch (c = bits) {
              case 0:
                bits = 0;
                maxpower = Math.pow(2, 8);
                power = 1;
                while (power != maxpower) {
                  resb = data.val & data.position;
                  data.position >>= 1;
                  if (data.position == 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index++);
                  }
                  bits |= (resb > 0 ? 1 : 0) * power;
                  power <<= 1;
                }
                dictionary[dictSize++] = f(bits);
                c = dictSize - 1;
                enlargeIn--;
                break;
              case 1:
                bits = 0;
                maxpower = Math.pow(2, 16);
                power = 1;
                while (power != maxpower) {
                  resb = data.val & data.position;
                  data.position >>= 1;
                  if (data.position == 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index++);
                  }
                  bits |= (resb > 0 ? 1 : 0) * power;
                  power <<= 1;
                }
                dictionary[dictSize++] = f(bits);
                c = dictSize - 1;
                enlargeIn--;
                break;
              case 2:
                return result.join("");
            }
            if (enlargeIn == 0) {
              enlargeIn = Math.pow(2, numBits);
              numBits++;
            }
            if (dictionary[c]) {
              entry = dictionary[c];
            } else {
              if (c === dictSize) {
                entry = w + w.charAt(0);
              } else {
                return null;
              }
            }
            result.push(entry);
            dictionary[dictSize++] = w + entry.charAt(0);
            enlargeIn--;
            w = entry;
            if (enlargeIn == 0) {
              enlargeIn = Math.pow(2, numBits);
              numBits++;
            }
          }
        }
      };
      return LZString2;
    })();
    if (typeof define === "function" && define.amd) {
      define(function() {
        return LZString;
      });
    } else if (typeof module !== "undefined" && module != null) {
      module.exports = LZString;
    } else if (typeof angular !== "undefined" && angular != null) {
      angular.module("LZString", []).factory("LZString", function() {
        return LZString;
      });
    }
  }
});

// ../../packages/schema/dist/plan.mjs
import { z } from "zod";
import { nanoid } from "nanoid";
var PlanStatusValues = [
  "draft",
  "pending_review",
  "changes_requested",
  "in_progress",
  "completed"
];
var PlanViewTabValues = [
  "plan",
  "activity",
  "deliverables",
  "changes"
];
var OriginPlatformValues = [
  "claude-code",
  "devin",
  "cursor",
  "windsurf",
  "aider",
  "unknown"
];
var ClaudeCodeOriginMetadataSchema = z.object({
  platform: z.literal("claude-code"),
  sessionId: z.string(),
  transcriptPath: z.string(),
  cwd: z.string().optional()
});
var DevinOriginMetadataSchema = z.object({
  platform: z.literal("devin"),
  sessionId: z.string()
});
var CursorOriginMetadataSchema = z.object({
  platform: z.literal("cursor"),
  conversationId: z.string(),
  generationId: z.string().optional()
});
var UnknownOriginMetadataSchema = z.object({ platform: z.literal("unknown") });
var OriginMetadataSchema = z.discriminatedUnion("platform", [
  ClaudeCodeOriginMetadataSchema,
  DevinOriginMetadataSchema,
  CursorOriginMetadataSchema,
  UnknownOriginMetadataSchema
]);
function parseClaudeCodeOrigin(hookMetadata) {
  if (!hookMetadata) return null;
  const result = ClaudeCodeOriginMetadataSchema.safeParse({
    platform: "claude-code",
    sessionId: hookMetadata.originSessionId,
    transcriptPath: hookMetadata.originTranscriptPath,
    cwd: hookMetadata.originCwd
  });
  return result.success ? result.data : null;
}
var ConversationVersionBaseSchema = z.object({
  versionId: z.string(),
  creator: z.string(),
  platform: z.enum(OriginPlatformValues),
  sessionId: z.string(),
  messageCount: z.number(),
  createdAt: z.number()
});
var ConversationVersionSchema = z.discriminatedUnion("handedOff", [ConversationVersionBaseSchema.extend({ handedOff: z.literal(false) }), ConversationVersionBaseSchema.extend({
  handedOff: z.literal(true),
  handedOffAt: z.number(),
  handedOffTo: z.string()
})]);
var PlanEventTypes = [
  "plan_created",
  "status_changed",
  "comment_added",
  "comment_resolved",
  "artifact_uploaded",
  "deliverable_linked",
  "pr_linked",
  "content_edited",
  "approved",
  "changes_requested",
  "completed",
  "conversation_imported",
  "conversation_handed_off",
  "step_completed",
  "plan_archived",
  "plan_unarchived",
  "conversation_exported",
  "plan_shared",
  "approval_requested",
  "input_request_created",
  "input_request_answered",
  "input_request_declined",
  "agent_activity"
];
var AgentActivityTypes = [
  "help_request",
  "help_request_resolved",
  "blocker",
  "blocker_resolved"
];
var PlanEventBaseSchema = z.object({
  id: z.string(),
  actor: z.string(),
  timestamp: z.number(),
  inboxWorthy: z.boolean().optional(),
  inboxFor: z.union([z.string(), z.array(z.string())]).optional()
});
var AgentActivityDataSchema = z.discriminatedUnion("activityType", [
  z.object({
    activityType: z.literal("help_request"),
    requestId: z.string(),
    message: z.string()
  }),
  z.object({
    activityType: z.literal("help_request_resolved"),
    requestId: z.string(),
    resolution: z.string().optional()
  }),
  z.object({
    activityType: z.literal("blocker"),
    message: z.string(),
    requestId: z.string()
  }),
  z.object({
    activityType: z.literal("blocker_resolved"),
    requestId: z.string(),
    resolution: z.string().optional()
  })
]);
var PlanEventSchema = z.discriminatedUnion("type", [
  PlanEventBaseSchema.extend({ type: z.enum([
    "plan_created",
    "content_edited",
    "plan_archived",
    "plan_unarchived",
    "plan_shared"
  ]) }),
  PlanEventBaseSchema.extend({
    type: z.literal("status_changed"),
    data: z.object({
      fromStatus: z.enum(PlanStatusValues),
      toStatus: z.enum(PlanStatusValues)
    })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("artifact_uploaded"),
    data: z.object({ artifactId: z.string() })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("comment_added"),
    data: z.object({
      commentId: z.string().optional(),
      prNumber: z.number().optional(),
      mentions: z.boolean().optional()
    }).optional()
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("comment_resolved"),
    data: z.object({
      commentId: z.string().optional(),
      resolvedCount: z.number().optional()
    }).optional()
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("deliverable_linked"),
    data: z.object({
      deliverableId: z.string().optional(),
      artifactId: z.string().optional(),
      allFulfilled: z.boolean().optional()
    }).optional()
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("pr_linked"),
    data: z.object({
      prNumber: z.number(),
      url: z.string().optional()
    })
  }),
  PlanEventBaseSchema.extend({
    type: z.enum(["approved", "changes_requested"]),
    data: z.object({ comment: z.string().optional() }).optional()
  }),
  PlanEventBaseSchema.extend({ type: z.literal("completed") }),
  PlanEventBaseSchema.extend({
    type: z.literal("step_completed"),
    data: z.object({
      stepId: z.string(),
      completed: z.boolean()
    })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("conversation_imported"),
    data: z.object({
      sourcePlatform: z.string().optional(),
      messageCount: z.number(),
      sourceSessionId: z.string().optional()
    })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("conversation_exported"),
    data: z.object({ messageCount: z.number() })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("conversation_handed_off"),
    data: z.object({
      handedOffTo: z.string(),
      messageCount: z.number()
    })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("approval_requested"),
    data: z.object({ requesterName: z.string().optional() }).optional()
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("input_request_created"),
    data: z.object({
      requestId: z.string(),
      requestType: z.enum([
        "text",
        "multiline",
        "choice",
        "confirm"
      ]),
      requestMessage: z.string()
    })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("input_request_answered"),
    data: z.object({
      requestId: z.string(),
      response: z.unknown(),
      answeredBy: z.string()
    })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("input_request_declined"),
    data: z.object({ requestId: z.string() })
  }),
  PlanEventBaseSchema.extend({
    type: z.literal("agent_activity"),
    data: AgentActivityDataSchema
  })
]);
function isInboxWorthy(event, username, ownerId) {
  if (!event.inboxWorthy) return false;
  if (!event.inboxFor) return true;
  const resolvedInboxFor = event.inboxFor === "owner" && ownerId ? ownerId : event.inboxFor;
  if (Array.isArray(resolvedInboxFor)) return resolvedInboxFor.includes(username);
  return resolvedInboxFor === username;
}
var PlanMetadataBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  repo: z.string().optional(),
  pr: z.number().optional(),
  ownerId: z.string().optional(),
  approvalRequired: z.boolean().optional(),
  approvedUsers: z.array(z.string()).optional(),
  rejectedUsers: z.array(z.string()).optional(),
  sessionTokenHash: z.string().optional(),
  archivedAt: z.number().optional(),
  archivedBy: z.string().optional(),
  origin: OriginMetadataSchema.optional(),
  viewedBy: z.record(z.string(), z.number()).optional(),
  conversationVersions: z.array(ConversationVersionSchema).optional(),
  events: z.array(PlanEventSchema).optional(),
  tags: z.array(z.string()).optional()
});
var PlanMetadataSchema = z.discriminatedUnion("status", [
  PlanMetadataBaseSchema.extend({ status: z.literal("draft") }),
  PlanMetadataBaseSchema.extend({
    status: z.literal("pending_review"),
    reviewRequestId: z.string()
  }),
  PlanMetadataBaseSchema.extend({
    status: z.literal("changes_requested"),
    reviewedAt: z.number(),
    reviewedBy: z.string(),
    reviewComment: z.string().optional()
  }),
  PlanMetadataBaseSchema.extend({
    status: z.literal("in_progress"),
    reviewedAt: z.number(),
    reviewedBy: z.string(),
    reviewComment: z.string().optional()
  }),
  PlanMetadataBaseSchema.extend({
    status: z.literal("completed"),
    completedAt: z.number(),
    completedBy: z.string(),
    snapshotUrl: z.string().optional()
  })
]);
var BaseArtifactSchema = z.object({
  id: z.string(),
  type: z.enum([
    "screenshot",
    "video",
    "test_results",
    "diff"
  ]),
  filename: z.string(),
  description: z.string().optional(),
  uploadedAt: z.number().optional()
});
var GitHubArtifactSchema = BaseArtifactSchema.extend({
  storage: z.literal("github"),
  url: z.string()
});
var LocalArtifactSchema = BaseArtifactSchema.extend({
  storage: z.literal("local"),
  localArtifactId: z.string()
});
var ArtifactSchema = z.discriminatedUnion("storage", [GitHubArtifactSchema, LocalArtifactSchema]);
function getArtifactUrl(repo, pr, planId, filename) {
  return `https://raw.githubusercontent.com/${repo}/plan-artifacts/pr-${pr}/${planId}/${filename}`;
}
var DeliverableSchema = z.object({
  id: z.string(),
  text: z.string(),
  linkedArtifactId: z.string().optional(),
  linkedAt: z.number().optional()
});
var PlanSnapshotSchema = z.object({
  id: z.string(),
  status: z.enum(PlanStatusValues),
  createdBy: z.string(),
  reason: z.string(),
  createdAt: z.number(),
  content: z.array(z.unknown()),
  threadSummary: z.object({
    total: z.number(),
    unresolved: z.number()
  }).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  deliverables: z.array(DeliverableSchema).optional()
});
var LinkedPRStatusValues = [
  "draft",
  "open",
  "merged",
  "closed"
];
var LinkedPRSchema = z.object({
  prNumber: z.number(),
  url: z.string(),
  linkedAt: z.number(),
  status: z.enum(LinkedPRStatusValues),
  branch: z.string().optional(),
  title: z.string().optional()
});
var PRReviewCommentSchema = z.object({
  id: z.string(),
  prNumber: z.number(),
  path: z.string(),
  line: z.number(),
  body: z.string(),
  author: z.string(),
  createdAt: z.number(),
  resolved: z.boolean().optional()
});
function createLinkedPR(params) {
  const linkedPR = {
    ...params,
    linkedAt: params.linkedAt ?? Date.now()
  };
  return LinkedPRSchema.parse(linkedPR);
}
function createGitHubArtifact(params) {
  const artifact = {
    id: nanoid(),
    ...params,
    storage: "github",
    uploadedAt: params.uploadedAt ?? Date.now()
  };
  return ArtifactSchema.parse(artifact);
}
function createLocalArtifact(params) {
  const artifact = {
    id: nanoid(),
    ...params,
    storage: "local",
    uploadedAt: params.uploadedAt ?? Date.now()
  };
  return ArtifactSchema.parse(artifact);
}
function createInitialConversationVersion(params) {
  const version = {
    ...params,
    handedOff: false
  };
  return ConversationVersionSchema.parse(version);
}
function createHandedOffConversationVersion(params) {
  const version = {
    ...params,
    handedOff: true
  };
  return ConversationVersionSchema.parse(version);
}

// ../../packages/schema/dist/yjs-helpers-Da2r3318.mjs
import { z as z2 } from "zod";
import { nanoid as nanoid2 } from "nanoid";
import * as Y from "yjs";
function assertNever(value) {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}
var AgentPresenceSchema = z2.object({
  agentType: z2.string(),
  sessionId: z2.string(),
  connectedAt: z2.number(),
  lastSeenAt: z2.number()
});
var ReviewCommentSchema = z2.object({
  author: z2.string(),
  content: z2.string(),
  createdAt: z2.number()
});
var ReviewFeedbackSchema = z2.object({
  threadId: z2.string(),
  blockId: z2.string().optional(),
  comments: z2.array(ReviewCommentSchema)
});
var CreateHookSessionRequestSchema = z2.object({
  sessionId: z2.string(),
  agentType: z2.string().default("claude-code"),
  metadata: z2.record(z2.string(), z2.unknown()).optional()
});
var CreateHookSessionResponseSchema = z2.object({
  planId: z2.string(),
  url: z2.string()
});
var UpdatePlanContentRequestSchema = z2.object({
  content: z2.string(),
  filePath: z2.string().optional()
});
var UpdatePlanContentResponseSchema = z2.object({
  success: z2.boolean(),
  updatedAt: z2.number()
});
var GetReviewStatusResponseSchema = z2.discriminatedUnion("status", [
  z2.object({ status: z2.literal("draft") }),
  z2.object({
    status: z2.literal("pending_review"),
    reviewRequestId: z2.string()
  }),
  z2.object({
    status: z2.literal("changes_requested"),
    reviewedAt: z2.number(),
    reviewedBy: z2.string(),
    reviewComment: z2.string().optional(),
    feedback: z2.array(ReviewFeedbackSchema).optional()
  }),
  z2.object({
    status: z2.literal("in_progress"),
    reviewedAt: z2.number(),
    reviewedBy: z2.string()
  }),
  z2.object({
    status: z2.literal("completed"),
    completedAt: z2.number(),
    completedBy: z2.string(),
    snapshotUrl: z2.string().optional()
  })
]);
var UpdatePresenceRequestSchema = z2.object({
  agentType: z2.string(),
  sessionId: z2.string()
});
var UpdatePresenceResponseSchema = z2.object({ success: z2.boolean() });
var HookApiErrorSchema = z2.object({ error: z2.string() });
var RegisterServerRequestSchema = z2.object({
  port: z2.number().int().positive(),
  pid: z2.number().int().positive()
});
var RegisterServerResponseSchema = z2.object({
  success: z2.boolean(),
  entry: z2.object({
    port: z2.number(),
    pid: z2.number(),
    url: z2.string(),
    registeredAt: z2.number()
  })
});
var UnregisterServerRequestSchema = z2.object({ pid: z2.number().int().positive() });
var UnregisterServerResponseSchema = z2.object({
  success: z2.boolean(),
  existed: z2.boolean()
});
var CreateSubscriptionRequestSchema = z2.object({
  subscribe: z2.array(z2.string()).optional(),
  windowMs: z2.number().positive().optional(),
  maxWindowMs: z2.number().positive().optional(),
  threshold: z2.number().positive().optional()
});
var CreateSubscriptionResponseSchema = z2.object({ clientId: z2.string() });
var InputRequestTypeValues = [
  "text",
  "multiline",
  "choice",
  "confirm"
];
var InputRequestStatusValues = [
  "pending",
  "answered",
  "declined",
  "cancelled"
];
var InputRequestBaseSchema = z2.object({
  id: z2.string(),
  createdAt: z2.number(),
  message: z2.string().min(1, "Message cannot be empty"),
  status: z2.enum(InputRequestStatusValues),
  defaultValue: z2.string().optional(),
  timeout: z2.number().int().min(10, "Timeout must be at least 10 seconds").max(600, "Timeout cannot exceed 10 minutes").optional(),
  planId: z2.string().optional(),
  response: z2.unknown().optional(),
  answeredAt: z2.number().optional(),
  answeredBy: z2.string().optional()
});
var TextInputSchema = InputRequestBaseSchema.extend({ type: z2.literal("text") });
var MultilineInputSchema = InputRequestBaseSchema.extend({ type: z2.literal("multiline") });
var ChoiceInputSchema = InputRequestBaseSchema.extend({
  type: z2.literal("choice"),
  options: z2.array(z2.string()).min(1, "Choice requests must have at least one option"),
  multiSelect: z2.boolean().optional()
});
var ConfirmInputSchema = InputRequestBaseSchema.extend({ type: z2.literal("confirm") });
var InputRequestSchema = z2.discriminatedUnion("type", [
  TextInputSchema,
  MultilineInputSchema,
  ChoiceInputSchema,
  ConfirmInputSchema
]);
function createInputRequest(params) {
  const baseFields = {
    id: nanoid2(),
    createdAt: Date.now(),
    message: params.message,
    defaultValue: params.defaultValue,
    status: "pending",
    timeout: params.timeout,
    planId: params.planId
  };
  let request;
  switch (params.type) {
    case "text":
      request = {
        ...baseFields,
        type: "text"
      };
      break;
    case "multiline":
      request = {
        ...baseFields,
        type: "multiline"
      };
      break;
    case "choice":
      request = {
        ...baseFields,
        type: "choice",
        options: params.options,
        multiSelect: params.multiSelect
      };
      break;
    case "confirm":
      request = {
        ...baseFields,
        type: "confirm"
      };
      break;
  }
  const parseResult = InputRequestSchema.safeParse(request);
  if (!parseResult.success) throw new Error(`Invalid input request: ${parseResult.error.issues[0]?.message}`);
  return parseResult.data;
}
var YDOC_KEYS = {
  METADATA: "metadata",
  DOCUMENT_FRAGMENT: "document",
  THREADS: "threads",
  STEP_COMPLETIONS: "stepCompletions",
  PLANS: "plans",
  ARTIFACTS: "artifacts",
  DELIVERABLES: "deliverables",
  PRESENCE: "presence",
  LINKED_PRS: "linkedPRs",
  PR_REVIEW_COMMENTS: "prReviewComments",
  EVENTS: "events",
  SNAPSHOTS: "snapshots",
  INPUT_REQUESTS: "inputRequests"
};
function isValidYDocKey(key) {
  return Object.values(YDOC_KEYS).includes(key);
}
var CommentBodySchema = z2.union([z2.string(), z2.array(z2.unknown())]);
var ThreadCommentSchema = z2.object({
  id: z2.string(),
  userId: z2.string(),
  body: CommentBodySchema,
  createdAt: z2.number()
});
var ThreadSchema = z2.object({
  id: z2.string(),
  comments: z2.array(ThreadCommentSchema),
  resolved: z2.boolean().optional(),
  selectedText: z2.string().optional()
});
function isThread(value) {
  return ThreadSchema.safeParse(value).success;
}
function parseThreads(data) {
  const threads = [];
  for (const [_key, value] of Object.entries(data)) {
    const result = ThreadSchema.safeParse(value);
    if (result.success) threads.push(result.data);
  }
  return threads;
}
function extractTextFromCommentBody(body) {
  if (typeof body === "string") return body;
  if (!Array.isArray(body)) return "";
  return body.map((block) => {
    if (typeof block === "string") return block;
    if (typeof block !== "object" || block === null) return "";
    const blockObj = block;
    if (Array.isArray(blockObj.content)) return blockObj.content.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null && "text" in item) return item.text;
      return "";
    }).join("");
    return "";
  }).join("\n");
}
function extractMentions(body) {
  const text = extractTextFromCommentBody(body);
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) if (match[1]) mentions.push(match[1]);
  return [...new Set(mentions)];
}
var VALID_STATUS_TRANSITIONS = {
  draft: ["pending_review", "in_progress"],
  pending_review: ["in_progress", "changes_requested"],
  changes_requested: ["pending_review", "in_progress"],
  in_progress: ["completed"],
  completed: []
};
function getPlanMetadata(ydoc) {
  const result = getPlanMetadataWithValidation(ydoc);
  return result.success ? result.data : null;
}
function getPlanMetadataWithValidation(ydoc) {
  const data = ydoc.getMap(YDOC_KEYS.METADATA).toJSON();
  if (!data || Object.keys(data).length === 0) return {
    success: false,
    error: "No metadata found in Y.Doc"
  };
  const result = PlanMetadataSchema.safeParse(data);
  if (!result.success) return {
    success: false,
    error: `Invalid metadata: ${result.error.message}`
  };
  return {
    success: true,
    data: result.data
  };
}
function setPlanMetadata(ydoc, metadata, actor) {
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    for (const [key, value] of Object.entries(metadata)) if (value !== void 0) map.set(key, value);
    map.set("updatedAt", Date.now());
  }, actor ? { actor } : void 0);
}
function applyPendingReviewTransition(map, transition) {
  map.set("reviewRequestId", transition.reviewRequestId);
}
function applyChangesRequestedTransition(map, transition) {
  map.set("reviewedAt", transition.reviewedAt);
  map.set("reviewedBy", transition.reviewedBy);
  if (transition.reviewComment !== void 0) map.set("reviewComment", transition.reviewComment);
}
function applyInProgressTransition(map, transition) {
  if (transition.reviewedAt !== void 0) map.set("reviewedAt", transition.reviewedAt);
  if (transition.reviewedBy !== void 0) map.set("reviewedBy", transition.reviewedBy);
  if (transition.reviewComment !== void 0) map.set("reviewComment", transition.reviewComment);
}
function applyCompletedTransition(map, transition) {
  map.set("completedAt", transition.completedAt);
  map.set("completedBy", transition.completedBy);
  if (transition.snapshotUrl !== void 0) map.set("snapshotUrl", transition.snapshotUrl);
}
function applyStatusTransitionFields(map, transition) {
  switch (transition.status) {
    case "pending_review":
      applyPendingReviewTransition(map, transition);
      break;
    case "changes_requested":
      applyChangesRequestedTransition(map, transition);
      break;
    case "in_progress":
      applyInProgressTransition(map, transition);
      break;
    case "completed":
      applyCompletedTransition(map, transition);
      break;
    default:
      assertNever(transition);
  }
}
function transitionPlanStatus(ydoc, transition, actor) {
  const metadataResult = getPlanMetadataWithValidation(ydoc);
  if (!metadataResult.success) return {
    success: false,
    error: metadataResult.error
  };
  const currentStatus = metadataResult.data.status;
  const validTargets = VALID_STATUS_TRANSITIONS[currentStatus];
  if (!validTargets.includes(transition.status)) return {
    success: false,
    error: `Invalid transition: cannot go from '${currentStatus}' to '${transition.status}'. Valid targets: ${validTargets.join(", ") || "none (terminal state)"}`
  };
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    map.set("status", transition.status);
    applyStatusTransitionFields(map, transition);
    map.set("updatedAt", Date.now());
  }, actor ? { actor } : void 0);
  return { success: true };
}
function initPlanMetadata(ydoc, init) {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const now = Date.now();
  map.set("id", init.id);
  map.set("title", init.title);
  map.set("status", "draft");
  map.set("createdAt", now);
  map.set("updatedAt", now);
  if (init.repo) map.set("repo", init.repo);
  if (init.pr) map.set("pr", init.pr);
  if (init.ownerId) {
    map.set("ownerId", init.ownerId);
    map.set("approvedUsers", [init.ownerId]);
    map.set("approvalRequired", init.approvalRequired ?? true);
  }
  if (init.sessionTokenHash) map.set("sessionTokenHash", init.sessionTokenHash);
  if (init.origin) map.set("origin", init.origin);
  if (init.tags) map.set("tags", init.tags);
  const result = getPlanMetadataWithValidation(ydoc);
  if (!result.success) throw new Error(`Failed to initialize metadata: ${result.error}`);
}
function getStepCompletions(ydoc) {
  const steps = ydoc.getMap("stepCompletions");
  return new Map(steps.entries());
}
function toggleStepCompletion(ydoc, stepId, actor) {
  ydoc.transact(() => {
    const steps = ydoc.getMap("stepCompletions");
    const current = steps.get(stepId) || false;
    steps.set(stepId, !current);
  }, actor ? { actor } : void 0);
}
function isStepCompleted(ydoc, stepId) {
  return ydoc.getMap("stepCompletions").get(stepId) || false;
}
function getArtifacts(ydoc) {
  return ydoc.getArray(YDOC_KEYS.ARTIFACTS).toJSON().map((item) => {
    if (!item || typeof item !== "object") return null;
    const artifact = item;
    if (artifact.url && !artifact.storage) return {
      ...artifact,
      storage: "github"
    };
    if (!artifact.storage && !artifact.url && !artifact.localArtifactId) return null;
    return artifact;
  }).filter((item) => item !== null).map((item) => ArtifactSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function addArtifact(ydoc, artifact, actor) {
  const validated = ArtifactSchema.parse(artifact);
  ydoc.transact(() => {
    ydoc.getArray(YDOC_KEYS.ARTIFACTS).push([validated]);
  }, actor ? { actor } : void 0);
}
function removeArtifact(ydoc, artifactId) {
  const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);
  const index = array.toJSON().findIndex((a) => a.id === artifactId);
  if (index === -1) return false;
  array.delete(index, 1);
  return true;
}
function getAgentPresences(ydoc) {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  const result = /* @__PURE__ */ new Map();
  for (const [sessionId, value] of map.entries()) {
    const parsed = AgentPresenceSchema.safeParse(value);
    if (parsed.success) result.set(sessionId, parsed.data);
  }
  return result;
}
function setAgentPresence(ydoc, presence, actor) {
  const validated = AgentPresenceSchema.parse(presence);
  ydoc.transact(() => {
    ydoc.getMap(YDOC_KEYS.PRESENCE).set(validated.sessionId, validated);
  }, actor ? { actor } : void 0);
}
function clearAgentPresence(ydoc, sessionId) {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  if (!map.has(sessionId)) return false;
  map.delete(sessionId);
  return true;
}
function getAgentPresence(ydoc, sessionId) {
  const value = ydoc.getMap(YDOC_KEYS.PRESENCE).get(sessionId);
  if (!value) return null;
  const parsed = AgentPresenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function getDeliverables(ydoc) {
  return ydoc.getArray(YDOC_KEYS.DELIVERABLES).toJSON().map((item) => DeliverableSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function addDeliverable(ydoc, deliverable, actor) {
  const validated = DeliverableSchema.parse(deliverable);
  ydoc.transact(() => {
    ydoc.getArray(YDOC_KEYS.DELIVERABLES).push([validated]);
  }, actor ? { actor } : void 0);
}
function linkArtifactToDeliverable(ydoc, deliverableId, artifactId, actor) {
  const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
  const deliverables = array.toJSON();
  const index = deliverables.findIndex((d) => d.id === deliverableId);
  if (index === -1) return false;
  const existing = deliverables[index];
  if (!existing) return false;
  const updated = {
    id: existing.id,
    text: existing.text,
    linkedArtifactId: artifactId,
    linkedAt: Date.now()
  };
  ydoc.transact(() => {
    array.delete(index, 1);
    array.insert(index, [updated]);
  }, actor ? { actor } : void 0);
  return true;
}
function getPlanOwnerId(ydoc) {
  const ownerId = ydoc.getMap(YDOC_KEYS.METADATA).get("ownerId");
  return typeof ownerId === "string" ? ownerId : null;
}
function isApprovalRequired(ydoc) {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  const approvalRequired = map.get("approvalRequired");
  if (typeof approvalRequired === "boolean") return approvalRequired;
  const ownerId = map.get("ownerId");
  return typeof ownerId === "string" && ownerId.length > 0;
}
function getApprovedUsers(ydoc) {
  const approvedUsers = ydoc.getMap(YDOC_KEYS.METADATA).get("approvedUsers");
  if (!Array.isArray(approvedUsers)) return [];
  return approvedUsers.filter((id) => typeof id === "string");
}
function isUserApproved(ydoc, userId) {
  if (getPlanOwnerId(ydoc) === userId) return true;
  return getApprovedUsers(ydoc).includes(userId);
}
function approveUser(ydoc, userId, actor) {
  const currentApproved = getApprovedUsers(ydoc);
  if (currentApproved.includes(userId)) return;
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    map.set("approvedUsers", [...currentApproved, userId]);
    map.set("updatedAt", Date.now());
  }, actor ? { actor } : void 0);
}
function revokeUser(ydoc, userId, actor) {
  if (userId === getPlanOwnerId(ydoc)) return false;
  const currentApproved = getApprovedUsers(ydoc);
  if (currentApproved.indexOf(userId) === -1) return false;
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    map.set("approvedUsers", currentApproved.filter((id) => id !== userId));
    map.set("updatedAt", Date.now());
  }, actor ? { actor } : void 0);
  return true;
}
function getRejectedUsers(ydoc) {
  const rejectedUsers = ydoc.getMap(YDOC_KEYS.METADATA).get("rejectedUsers");
  if (!Array.isArray(rejectedUsers)) return [];
  return rejectedUsers.filter((id) => typeof id === "string");
}
function isUserRejected(ydoc, userId) {
  return getRejectedUsers(ydoc).includes(userId);
}
function rejectUser(ydoc, userId, actor) {
  if (userId === getPlanOwnerId(ydoc)) return;
  const currentRejected = getRejectedUsers(ydoc);
  const currentApproved = getApprovedUsers(ydoc);
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    if (!currentRejected.includes(userId)) map.set("rejectedUsers", [...currentRejected, userId]);
    if (currentApproved.includes(userId)) map.set("approvedUsers", currentApproved.filter((id) => id !== userId));
    map.set("updatedAt", Date.now());
  }, actor ? { actor } : void 0);
}
function unrejectUser(ydoc, userId, actor) {
  const currentRejected = getRejectedUsers(ydoc);
  if (currentRejected.indexOf(userId) === -1) return false;
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    map.set("rejectedUsers", currentRejected.filter((id) => id !== userId));
    map.set("updatedAt", Date.now());
  }, actor ? { actor } : void 0);
  return true;
}
function getLinkedPRs(ydoc) {
  return ydoc.getArray(YDOC_KEYS.LINKED_PRS).toJSON().map((item) => LinkedPRSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function linkPR(ydoc, pr, actor) {
  const validated = LinkedPRSchema.parse(pr);
  ydoc.transact(() => {
    const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
    const index = array.toJSON().findIndex((p) => p.prNumber === validated.prNumber);
    if (index !== -1) array.delete(index, 1);
    array.push([validated]);
  }, actor ? { actor } : void 0);
}
function unlinkPR(ydoc, prNumber) {
  const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
  const index = array.toJSON().findIndex((p) => p.prNumber === prNumber);
  if (index === -1) return false;
  array.delete(index, 1);
  return true;
}
function getLinkedPR(ydoc, prNumber) {
  return getLinkedPRs(ydoc).find((pr) => pr.prNumber === prNumber) ?? null;
}
function updateLinkedPRStatus(ydoc, prNumber, status) {
  const array = ydoc.getArray(YDOC_KEYS.LINKED_PRS);
  const existing = array.toJSON();
  const index = existing.findIndex((p) => p.prNumber === prNumber);
  if (index === -1) return false;
  const pr = existing[index];
  if (!pr) return false;
  array.delete(index, 1);
  array.insert(index, [{
    ...pr,
    status
  }]);
  return true;
}
function getPRReviewComments(ydoc) {
  return ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS).toJSON().map((item) => PRReviewCommentSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function getPRReviewCommentsForPR(ydoc, prNumber) {
  return getPRReviewComments(ydoc).filter((c) => c.prNumber === prNumber);
}
function addPRReviewComment(ydoc, comment, actor) {
  const validated = PRReviewCommentSchema.parse(comment);
  ydoc.transact(() => {
    ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS).push([validated]);
  }, actor ? { actor } : void 0);
}
function resolvePRReviewComment(ydoc, commentId, resolved) {
  const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);
  const existing = array.toJSON();
  const index = existing.findIndex((c) => c.id === commentId);
  if (index === -1) return false;
  const comment = existing[index];
  if (!comment) return false;
  array.delete(index, 1);
  array.insert(index, [{
    ...comment,
    resolved
  }]);
  return true;
}
function removePRReviewComment(ydoc, commentId) {
  const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);
  const index = array.toJSON().findIndex((c) => c.id === commentId);
  if (index === -1) return false;
  array.delete(index, 1);
  return true;
}
function markPlanAsViewed(ydoc, username) {
  const map = ydoc.getMap(YDOC_KEYS.METADATA);
  ydoc.transact(() => {
    const existingViewedBy = map.get("viewedBy");
    let viewedBy = {};
    if (existingViewedBy instanceof Y.Map) {
      for (const [key, value] of existingViewedBy.entries()) if (typeof value === "number") viewedBy[key] = value;
    } else if (existingViewedBy && typeof existingViewedBy === "object") viewedBy = { ...existingViewedBy };
    viewedBy[username] = Date.now();
    const viewedByMap = new Y.Map();
    for (const [user, timestamp] of Object.entries(viewedBy)) viewedByMap.set(user, timestamp);
    map.set("viewedBy", viewedByMap);
  });
}
function getViewedBy(ydoc) {
  const viewedBy = ydoc.getMap(YDOC_KEYS.METADATA).get("viewedBy");
  if (!viewedBy) return {};
  if (viewedBy instanceof Y.Map) {
    const result = {};
    for (const [key, value] of viewedBy.entries()) if (typeof value === "number") result[key] = value;
    return result;
  }
  if (typeof viewedBy === "object") return viewedBy;
  return {};
}
function isPlanUnread(metadata, username, viewedBy) {
  const lastViewed = (viewedBy ?? {})[username];
  if (!lastViewed) return true;
  return lastViewed < metadata.updatedAt;
}
function getConversationVersions(ydoc) {
  return getPlanMetadata(ydoc)?.conversationVersions || [];
}
function addConversationVersion(ydoc, version, actor) {
  const validated = ConversationVersionSchema.parse(version);
  ydoc.transact(() => {
    const metadata = ydoc.getMap(YDOC_KEYS.METADATA);
    const versions = metadata.get("conversationVersions") || [];
    metadata.set("conversationVersions", [...versions, validated]);
  }, actor ? { actor } : void 0);
}
function markVersionHandedOff(ydoc, versionId, handedOffTo, actor) {
  const updated = getConversationVersions(ydoc).map((v) => {
    if (v.versionId !== versionId) return v;
    const handedOffVersion = {
      ...v,
      handedOff: true,
      handedOffAt: Date.now(),
      handedOffTo
    };
    return ConversationVersionSchema.parse(handedOffVersion);
  });
  ydoc.transact(() => {
    ydoc.getMap(YDOC_KEYS.METADATA).set("conversationVersions", updated);
  }, actor ? { actor } : void 0);
}
function logPlanEvent(ydoc, type, actor, ...args) {
  const eventsArray = ydoc.getArray(YDOC_KEYS.EVENTS);
  const [data, options] = args;
  const eventId = options?.id ?? nanoid2();
  const baseEvent = {
    id: eventId,
    type,
    actor,
    timestamp: Date.now(),
    inboxWorthy: options?.inboxWorthy,
    inboxFor: options?.inboxFor
  };
  const rawEvent = data !== void 0 ? {
    ...baseEvent,
    data
  } : baseEvent;
  const parsed = PlanEventSchema.safeParse(rawEvent);
  if (!parsed.success) throw new Error(`Invalid plan event: ${parsed.error.message}`);
  eventsArray.push([parsed.data]);
  return eventId;
}
function getPlanEvents(ydoc) {
  return ydoc.getArray(YDOC_KEYS.EVENTS).toJSON().map((item) => PlanEventSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data);
}
function getSnapshots(ydoc) {
  return ydoc.getArray(YDOC_KEYS.SNAPSHOTS).toJSON().map((item) => PlanSnapshotSchema.safeParse(item)).filter((result) => result.success).map((result) => result.data).sort((a, b) => a.createdAt - b.createdAt);
}
function addSnapshot(ydoc, snapshot, actor) {
  const validated = PlanSnapshotSchema.parse(snapshot);
  ydoc.transact(() => {
    ydoc.getArray(YDOC_KEYS.SNAPSHOTS).push([validated]);
  }, actor ? { actor } : void 0);
}
function createPlanSnapshot(ydoc, reason, actor, status, blocks) {
  const threads = parseThreads(ydoc.getMap(YDOC_KEYS.THREADS).toJSON());
  const unresolved = threads.filter((t2) => !t2.resolved).length;
  const artifacts = getArtifacts(ydoc);
  const deliverables = getDeliverables(ydoc);
  return {
    id: nanoid2(),
    status,
    createdBy: actor,
    reason,
    createdAt: Date.now(),
    content: blocks,
    threadSummary: threads.length > 0 ? {
      total: threads.length,
      unresolved
    } : void 0,
    artifacts: artifacts.length > 0 ? artifacts : void 0,
    deliverables: deliverables.length > 0 ? deliverables : void 0
  };
}
function getLatestSnapshot(ydoc) {
  const snapshots = getSnapshots(ydoc);
  if (snapshots.length === 0) return null;
  return snapshots[snapshots.length - 1] ?? null;
}
function addPlanTag(ydoc, tag, actor) {
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    const currentTags = map.get("tags") || [];
    const normalizedTag = tag.toLowerCase().trim();
    if (!normalizedTag || currentTags.includes(normalizedTag)) return;
    map.set("tags", [...currentTags, normalizedTag]);
    map.set("updatedAt", Date.now());
  }, actor ? { actor } : void 0);
}
function removePlanTag(ydoc, tag, actor) {
  ydoc.transact(() => {
    const map = ydoc.getMap(YDOC_KEYS.METADATA);
    const currentTags = map.get("tags") || [];
    const normalizedTag = tag.toLowerCase().trim();
    map.set("tags", currentTags.filter((t2) => t2 !== normalizedTag));
    map.set("updatedAt", Date.now());
  }, actor ? { actor } : void 0);
}
function getAllTagsFromIndex(indexEntries) {
  const tagSet = /* @__PURE__ */ new Set();
  for (const entry of indexEntries) if (entry.tags) for (const tag of entry.tags) tagSet.add(tag);
  return Array.from(tagSet).sort();
}
function archivePlan(ydoc, actorId) {
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) return {
    success: false,
    error: "Plan metadata not found"
  };
  if (metadata.archivedAt) return {
    success: false,
    error: "Plan is already archived"
  };
  ydoc.transact(() => {
    const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
    metadataMap.set("archivedAt", Date.now());
    metadataMap.set("archivedBy", actorId);
    metadataMap.set("updatedAt", Date.now());
  }, { actor: actorId });
  return { success: true };
}
function unarchivePlan(ydoc, actorId) {
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) return {
    success: false,
    error: "Plan metadata not found"
  };
  if (!metadata.archivedAt) return {
    success: false,
    error: "Plan is not archived"
  };
  ydoc.transact(() => {
    const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
    metadataMap.delete("archivedAt");
    metadataMap.delete("archivedBy");
    metadataMap.set("updatedAt", Date.now());
  }, { actor: actorId });
  return { success: true };
}
function answerInputRequest(ydoc, requestId, response, answeredBy) {
  const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
  const requests = requestsArray.toJSON();
  const index = requests.findIndex((r) => r.id === requestId);
  if (index === -1) return {
    success: false,
    error: "Request not found"
  };
  const request = requests[index];
  if (!request) return {
    success: false,
    error: "Request not found"
  };
  if (request.status !== "pending") return {
    success: false,
    error: `Request is not pending`
  };
  const answeredRequest = {
    ...request,
    status: "answered",
    response,
    answeredAt: Date.now(),
    answeredBy
  };
  const validated = InputRequestSchema.parse(answeredRequest);
  ydoc.transact(() => {
    requestsArray.delete(index, 1);
    requestsArray.insert(index, [validated]);
  });
  return { success: true };
}
function cancelInputRequest(ydoc, requestId) {
  const requestsArray = ydoc.getArray(YDOC_KEYS.INPUT_REQUESTS);
  const requests = requestsArray.toJSON();
  const index = requests.findIndex((r) => r.id === requestId);
  if (index === -1) return {
    success: false,
    error: "Request not found"
  };
  const request = requests[index];
  if (!request) return {
    success: false,
    error: "Request not found"
  };
  if (request.status !== "pending") return {
    success: false,
    error: `Request is not pending`
  };
  const cancelledRequest = {
    ...request,
    status: "cancelled"
  };
  const validated = InputRequestSchema.parse(cancelledRequest);
  ydoc.transact(() => {
    requestsArray.delete(index, 1);
    requestsArray.insert(index, [validated]);
  });
  return { success: true };
}

// ../../packages/schema/dist/url-encoding.mjs
var import_lz_string = __toESM(require_lz_string(), 1);
function isUrlEncodedPlanV1(plan) {
  return plan.v === 1;
}
function isUrlEncodedPlanV2(plan) {
  return plan.v === 2;
}
function encodePlan(plan) {
  const json = JSON.stringify(plan);
  return import_lz_string.default.compressToEncodedURIComponent(json);
}
function decodePlan(encoded) {
  try {
    const json = import_lz_string.default.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    return JSON.parse(json);
  } catch (_error) {
    return null;
  }
}
function createPlanUrl(baseUrl, plan) {
  const encoded = encodePlan(plan);
  const url = new URL(baseUrl);
  url.searchParams.set("d", encoded);
  return url.toString();
}
function selectKeyVersionIds(snapshots) {
  if (snapshots.length === 0) return [];
  if (snapshots.length <= 3) return snapshots.map((s) => s.id);
  const ids = [];
  const first = snapshots[0];
  if (first) ids.push(first.id);
  const firstApproval = snapshots.find((s) => s.status === "in_progress");
  if (firstApproval && !ids.includes(firstApproval.id)) ids.push(firstApproval.id);
  const last = snapshots[snapshots.length - 1];
  if (last && !ids.includes(last.id)) ids.push(last.id);
  return ids;
}
function createPlanUrlWithHistory(baseUrl, plan, snapshots) {
  const versionRefs = snapshots.map((s) => ({
    id: s.id,
    status: s.status,
    createdBy: s.createdBy,
    reason: s.reason,
    createdAt: s.createdAt,
    threads: s.threadSummary
  }));
  const keyVersionIds = selectKeyVersionIds(snapshots);
  const keyVersions = snapshots.filter((s) => keyVersionIds.includes(s.id)).map((s) => ({
    id: s.id,
    content: s.content
  }));
  return createPlanUrl(baseUrl, {
    v: 2,
    ...plan,
    versionRefs: versionRefs.length > 0 ? versionRefs : void 0,
    keyVersions: keyVersions.length > 0 ? keyVersions : void 0
  });
}
function getPlanFromUrl() {
  if (typeof globalThis !== "undefined" && "location" in globalThis) {
    const location = globalThis.location;
    const encoded = new URLSearchParams(location.search).get("d");
    if (!encoded) return null;
    return decodePlan(encoded);
  }
  return null;
}

// ../../packages/schema/dist/index.mjs
import { z as z3 } from "zod";
import * as Y2 from "yjs";
import { TRPCError, initTRPC } from "@trpc/server";
var A2ATextPartSchema = z3.object({
  type: z3.literal("text"),
  text: z3.string()
});
var A2ADataPartSchema = z3.object({
  type: z3.literal("data"),
  data: z3.unknown()
});
var A2AFilePartSchema = z3.object({
  type: z3.literal("file"),
  uri: z3.string(),
  mediaType: z3.string().optional(),
  name: z3.string().optional()
});
var A2APartSchema = z3.object({ type: z3.enum([
  "text",
  "data",
  "file"
]) }).passthrough().superRefine((val, ctx) => {
  if (val.type === "text") {
    if (typeof val.text !== "string") ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "text part must have a string text field"
    });
  } else if (val.type === "data") {
    if (!("data" in val)) ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "data part must have a data field"
    });
  } else if (val.type === "file") {
    if (typeof val.uri !== "string") ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "file part must have a string uri field"
    });
  }
});
function isValidA2APart(part) {
  if (!part || typeof part !== "object") return false;
  const p = part;
  const t$1 = p.type;
  if (t$1 === "text") return typeof p.text === "string";
  else if (t$1 === "data") return "data" in p;
  else if (t$1 === "file") return typeof p.uri === "string";
  return false;
}
function isValidA2AParts(parts) {
  if (!Array.isArray(parts)) return false;
  return parts.every(isValidA2APart);
}
var A2AMessageSchema = z3.object({
  messageId: z3.string(),
  role: z3.enum(["user", "agent"]),
  contextId: z3.string().optional(),
  taskId: z3.string().optional(),
  referenceTaskIds: z3.array(z3.string()).optional(),
  metadata: z3.record(z3.string(), z3.unknown()).optional(),
  extensions: z3.array(z3.string()).optional()
}).passthrough().refine((val) => {
  const parts = val.parts;
  return isValidA2AParts(parts);
}, {
  message: "Invalid parts array - each part must have valid type and required fields",
  path: ["parts"]
}).transform((val) => ({
  ...val,
  parts: val.parts
}));
var ConversationExportMetaSchema = z3.object({
  exportId: z3.string(),
  sourcePlatform: z3.string(),
  sourceSessionId: z3.string(),
  planId: z3.string(),
  exportedAt: z3.number(),
  messageCount: z3.number(),
  compressedBytes: z3.number(),
  uncompressedBytes: z3.number()
});
z3.object({
  type: z3.literal("text"),
  text: z3.string()
});
z3.object({
  type: z3.literal("tool_use"),
  id: z3.string(),
  name: z3.string(),
  input: z3.record(z3.string(), z3.unknown())
});
z3.object({
  type: z3.literal("tool_result"),
  tool_use_id: z3.string(),
  content: z3.unknown(),
  is_error: z3.boolean().optional()
});
var ClaudeCodeContentBlockSchema = z3.object({ type: z3.enum([
  "text",
  "tool_use",
  "tool_result"
]) }).passthrough().superRefine((val, ctx) => {
  const typedVal = val;
  if (val.type === "text") {
    if (typeof typedVal.text !== "string") ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "text block must have a string text field"
    });
  } else if (val.type === "tool_use") {
    if (typeof typedVal.id !== "string") ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "tool_use block must have a string id field"
    });
    if (typeof typedVal.name !== "string") ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "tool_use block must have a string name field"
    });
    if (typeof typedVal.input !== "object" || typedVal.input === null) ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "tool_use block must have an object input field"
    });
  } else if (val.type === "tool_result") {
    if (typeof typedVal.tool_use_id !== "string") ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      message: "tool_result block must have a string tool_use_id field"
    });
  }
});
var ClaudeCodeUsageSchema = z3.object({
  input_tokens: z3.number(),
  output_tokens: z3.number(),
  cache_creation_input_tokens: z3.number().optional(),
  cache_read_input_tokens: z3.number().optional()
});
var ClaudeCodeMessageInnerSchema = z3.object({
  role: z3.string(),
  content: z3.array(ClaudeCodeContentBlockSchema),
  id: z3.string().optional(),
  model: z3.string().optional(),
  usage: ClaudeCodeUsageSchema.optional()
});
var ClaudeCodeMessageSchema = z3.object({
  sessionId: z3.string(),
  type: z3.enum([
    "user",
    "assistant",
    "summary"
  ]),
  message: ClaudeCodeMessageInnerSchema,
  uuid: z3.string(),
  timestamp: z3.string(),
  parentUuid: z3.string().optional(),
  costUSD: z3.number().optional(),
  durationMs: z3.number().optional()
});
function parseClaudeCodeTranscriptString(content) {
  const lines = content.split("\n").filter((line) => line.trim());
  const messages = [];
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      const result = ClaudeCodeMessageSchema.safeParse(parsed);
      if (result.success) messages.push(result.data);
      else errors.push({
        line: i + 1,
        error: `Validation failed: ${result.error.message}`
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push({
        line: i + 1,
        error: `JSON parse error: ${errorMessage}`
      });
    }
  }
  return {
    messages,
    errors
  };
}
function assertNever$1(x) {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}
function convertContentBlock(block) {
  switch (block.type) {
    case "text":
      return [{
        type: "text",
        text: block.text
      }];
    case "tool_use":
      return [{
        type: "data",
        data: { toolUse: {
          name: block.name,
          id: block.id,
          input: block.input
        } }
      }];
    case "tool_result":
      return [{
        type: "data",
        data: { toolResult: {
          toolUseId: block.tool_use_id,
          content: block.content,
          isError: block.is_error ?? false
        } }
      }];
    default:
      return assertNever$1(block);
  }
}
function convertMessage(msg, contextId) {
  const role = msg.message.role === "user" ? "user" : "agent";
  const parts = msg.message.content.flatMap((block) => convertContentBlock(block));
  return {
    messageId: msg.uuid,
    role,
    parts,
    contextId,
    metadata: {
      timestamp: msg.timestamp,
      platform: "claude-code",
      parentMessageId: msg.parentUuid,
      model: msg.message.model,
      usage: msg.message.usage,
      costUSD: msg.costUSD,
      durationMs: msg.durationMs
    }
  };
}
function claudeCodeToA2A(messages, contextId) {
  return messages.filter((msg) => msg.type !== "summary").map((msg) => convertMessage(msg, contextId));
}
function validateA2AMessages(messages) {
  const valid = [];
  const errors = [];
  for (let i = 0; i < messages.length; i++) {
    const result = A2AMessageSchema.safeParse(messages[i]);
    if (result.success) valid.push(result.data);
    else errors.push({
      index: i,
      error: result.error.message
    });
  }
  return {
    valid,
    errors
  };
}
function getFirstTextPart(parts) {
  return parts.filter((p) => p.type === "text")[0];
}
function extractTitleFromMessage(msg) {
  if (!msg) return "Imported Conversation";
  const firstPart = getFirstTextPart(msg.parts);
  if (!firstPart) return "Imported Conversation";
  const text = firstPart.text;
  return text.length > 50 ? `${text.slice(0, 50)}...` : text;
}
function isToolDataPart(part) {
  const data = part.data;
  return Boolean(data && typeof data === "object" && ("toolUse" in data || "toolResult" in data));
}
function countToolInteractions(parts) {
  return parts.filter((p) => p.type === "data").filter(isToolDataPart).length;
}
function summarizeMessage(msg) {
  const prefix = msg.role === "user" ? "User" : "Agent";
  const firstTextPart = getFirstTextPart(msg.parts);
  if (firstTextPart) return `${prefix}: ${firstTextPart.text.slice(0, 100)}${firstTextPart.text.length > 100 ? "..." : ""}`;
  const toolCount = countToolInteractions(msg.parts);
  if (toolCount > 0) return `${prefix}: [${toolCount} tool interaction(s)]`;
}
function summarizeA2AConversation(messages, maxMessages = 3) {
  const title = extractTitleFromMessage(messages.find((m) => m.role === "user"));
  const summaryLines = messages.slice(0, maxMessages).map(summarizeMessage).filter(Boolean);
  if (messages.length > maxMessages) summaryLines.push(`... and ${messages.length - maxMessages} more messages`);
  return {
    title,
    text: summaryLines.join("\n")
  };
}
function isToolUseData(data) {
  if (!data || typeof data !== "object") return false;
  const d = data;
  if (!d.toolUse || typeof d.toolUse !== "object") return false;
  const toolUse = d.toolUse;
  return typeof toolUse.name === "string" && typeof toolUse.id === "string" && typeof toolUse.input === "object";
}
function isToolResultData(data) {
  if (!data || typeof data !== "object") return false;
  const d = data;
  if (!d.toolResult || typeof d.toolResult !== "object") return false;
  return typeof d.toolResult.toolUseId === "string";
}
function convertA2APartToContentBlock(part) {
  switch (part.type) {
    case "text":
      return [{
        type: "text",
        text: part.text
      }];
    case "data": {
      const data = part.data;
      if (isToolUseData(data)) return [{
        type: "tool_use",
        id: data.toolUse.id,
        name: data.toolUse.name,
        input: data.toolUse.input
      }];
      if (isToolResultData(data)) return [{
        type: "tool_result",
        tool_use_id: data.toolResult.toolUseId,
        content: data.toolResult.content,
        is_error: data.toolResult.isError
      }];
      return [{
        type: "text",
        text: `[Data: ${JSON.stringify(data)}]`
      }];
    }
    case "file":
      return [{
        type: "text",
        text: `[File: ${part.name ?? part.uri}${part.mediaType ? ` (${part.mediaType})` : ""}]`
      }];
    default:
      return assertNever$1(part);
  }
}
function convertA2AToClaudeCodeMessage(msg, sessionId, parentUuid) {
  const role = msg.role === "user" ? "user" : "assistant";
  const type = msg.role === "user" ? "user" : "assistant";
  const content = msg.parts.flatMap(convertA2APartToContentBlock);
  const metadata = msg.metadata || {};
  const timestamp = typeof metadata.timestamp === "string" ? metadata.timestamp : (/* @__PURE__ */ new Date()).toISOString();
  const model = typeof metadata.model === "string" ? metadata.model : void 0;
  const usage = metadata.usage;
  const costUSD = typeof metadata.costUSD === "number" ? metadata.costUSD : void 0;
  const durationMs = typeof metadata.durationMs === "number" ? metadata.durationMs : void 0;
  return {
    sessionId,
    type,
    message: {
      role,
      content,
      ...model && { model },
      ...usage && { usage }
    },
    uuid: msg.messageId,
    timestamp,
    ...parentUuid && { parentUuid },
    ...costUSD !== void 0 && { costUSD },
    ...durationMs !== void 0 && { durationMs }
  };
}
function a2aToClaudeCode(messages, sessionId) {
  const resolvedSessionId = sessionId ?? crypto.randomUUID();
  let parentUuid;
  return messages.map((msg) => {
    const claudeMsg = convertA2AToClaudeCodeMessage(msg, resolvedSessionId, parentUuid);
    parentUuid = claudeMsg.uuid;
    return claudeMsg;
  });
}
function formatAsClaudeCodeJSONL(messages) {
  return messages.map((msg) => JSON.stringify(msg)).join("\n");
}
function formatDeliverablesForLLM(deliverables) {
  if (deliverables.length === 0) return "";
  let output = "## Deliverables\n\n";
  output += "Available deliverable IDs for artifact linking:\n\n";
  for (const deliverable of deliverables) {
    const checkbox = deliverable.linkedArtifactId ? "[x]" : "[ ]";
    const linkedInfo = deliverable.linkedArtifactId ? ` (linked to artifact: ${deliverable.linkedArtifactId})` : "";
    output += `- ${checkbox} ${deliverable.text} {id="${deliverable.id}"}${linkedInfo}
`;
  }
  return output;
}
var DELIVERABLE_MARKER = "{#deliverable}";
function extractDeliverables(blocks) {
  const deliverables = [];
  function processBlock(block) {
    const text = extractTextFromBlock(block);
    if (text.includes(DELIVERABLE_MARKER)) {
      const markerRegex = new RegExp(`\\s*${DELIVERABLE_MARKER.replace(/[{}#]/g, "\\$&")}\\s*`, "g");
      const cleanText = text.replace(markerRegex, "").trim();
      deliverables.push({
        id: block.id,
        text: cleanText
      });
    }
    if (block.children && Array.isArray(block.children)) for (const child of block.children) processBlock(child);
  }
  for (const block of blocks) processBlock(block);
  return deliverables;
}
function extractTextFromBlock(block) {
  if (!block.content || !Array.isArray(block.content) || block.content.length === 0) return "";
  return block.content.map((item) => item.text || "").join("").trim();
}
var GitHubPRResponseSchema = z3.object({
  number: z3.number(),
  html_url: z3.string().url(),
  title: z3.string(),
  state: z3.enum(["open", "closed"]),
  draft: z3.boolean(),
  merged: z3.boolean(),
  head: z3.object({ ref: z3.string() })
});
function asPlanId(id) {
  return id;
}
function asAwarenessClientId(id) {
  return id;
}
function asWebRTCPeerId(id) {
  return id;
}
function asGitHubUsername(username) {
  return username;
}
var InviteTokenSchema = z3.object({
  id: z3.string(),
  tokenHash: z3.string(),
  planId: z3.string(),
  createdBy: z3.string(),
  createdAt: z3.number(),
  expiresAt: z3.number(),
  maxUses: z3.number().nullable(),
  useCount: z3.number(),
  revoked: z3.boolean(),
  label: z3.string().optional()
});
var InviteRedemptionSchema = z3.object({
  redeemedBy: z3.string(),
  redeemedAt: z3.number(),
  tokenId: z3.string()
});
function parseInviteFromUrl(url) {
  try {
    const inviteParam = new URL(url).searchParams.get("invite");
    if (!inviteParam) return null;
    const [tokenId, tokenValue] = inviteParam.split(":");
    if (!tokenId || !tokenValue) return null;
    return {
      tokenId,
      tokenValue
    };
  } catch {
    return null;
  }
}
function buildInviteUrl(baseUrl, planId, tokenId, tokenValue) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = new URL(`${normalizedBase}/task/${planId}`);
  url.searchParams.set("invite", `${tokenId}:${tokenValue}`);
  return url.toString();
}
function getTokenTimeRemaining(expiresAt) {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return {
    expired: true,
    minutes: 0,
    formatted: "Expired"
  };
  const minutes = Math.ceil(remaining / 6e4);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return {
      expired: false,
      minutes,
      formatted: mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    };
  }
  return {
    expired: false,
    minutes,
    formatted: `${minutes}m`
  };
}
var P2PMessageType = {
  CONVERSATION_EXPORT_START: 240,
  CONVERSATION_CHUNK: 241,
  CONVERSATION_EXPORT_END: 242
};
var ConversationExportStartMetaSchema = z3.object({
  exportId: z3.string(),
  totalChunks: z3.number().int().positive(),
  totalBytes: z3.number().int().nonnegative(),
  compressedBytes: z3.number().int().nonnegative(),
  sourcePlatform: z3.string(),
  sourceSessionId: z3.string(),
  planId: z3.string(),
  exportedAt: z3.number().int().positive()
});
var ChunkMessageSchema = z3.object({
  exportId: z3.string(),
  chunkIndex: z3.number().int().nonnegative(),
  data: z3.instanceof(Uint8Array)
});
var ConversationExportEndSchema = z3.object({
  exportId: z3.string(),
  checksum: z3.string()
});
function isConversationExportStart(data) {
  return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_EXPORT_START;
}
function isConversationChunk(data) {
  return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_CHUNK;
}
function isConversationExportEnd(data) {
  return data.length > 0 && data[0] === P2PMessageType.CONVERSATION_EXPORT_END;
}
function isP2PConversationMessage(data) {
  if (data.length === 0) return false;
  const type = data[0];
  return type === P2PMessageType.CONVERSATION_EXPORT_START || type === P2PMessageType.CONVERSATION_CHUNK || type === P2PMessageType.CONVERSATION_EXPORT_END;
}
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
function encodeExportStartMessage(meta) {
  const jsonBytes = textEncoder.encode(JSON.stringify(meta));
  const result = new Uint8Array(1 + jsonBytes.length);
  result[0] = P2PMessageType.CONVERSATION_EXPORT_START;
  result.set(jsonBytes, 1);
  return result;
}
function decodeExportStartMessage(data) {
  if (data.length === 0 || data[0] !== P2PMessageType.CONVERSATION_EXPORT_START) throw new Error("Invalid export start message: wrong type byte");
  const jsonStr = textDecoder.decode(data.slice(1));
  const parsed = JSON.parse(jsonStr);
  return ConversationExportStartMetaSchema.parse(parsed);
}
function encodeChunkMessage(chunk) {
  const exportIdBytes = textEncoder.encode(chunk.exportId);
  const result = new Uint8Array(5 + exportIdBytes.length + 4 + chunk.data.length);
  let offset = 0;
  result[offset] = P2PMessageType.CONVERSATION_CHUNK;
  offset += 1;
  const view = new DataView(result.buffer);
  view.setUint32(offset, exportIdBytes.length, false);
  offset += 4;
  result.set(exportIdBytes, offset);
  offset += exportIdBytes.length;
  view.setUint32(offset, chunk.chunkIndex, false);
  offset += 4;
  result.set(chunk.data, offset);
  return result;
}
function decodeChunkMessage(data) {
  if (data.length < 9 || data[0] !== P2PMessageType.CONVERSATION_CHUNK) throw new Error("Invalid chunk message: too short or wrong type byte");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 1;
  const exportIdLength = view.getUint32(offset, false);
  offset += 4;
  if (data.length < 9 + exportIdLength) throw new Error("Invalid chunk message: exportId extends beyond message");
  const exportId = textDecoder.decode(data.slice(offset, offset + exportIdLength));
  offset += exportIdLength;
  const chunkIndex = view.getUint32(offset, false);
  offset += 4;
  const chunkData = data.slice(offset);
  return ChunkMessageSchema.parse({
    exportId,
    chunkIndex,
    data: chunkData
  });
}
function encodeExportEndMessage(end) {
  const jsonBytes = textEncoder.encode(JSON.stringify(end));
  const result = new Uint8Array(1 + jsonBytes.length);
  result[0] = P2PMessageType.CONVERSATION_EXPORT_END;
  result.set(jsonBytes, 1);
  return result;
}
function decodeExportEndMessage(data) {
  if (data.length === 0 || data[0] !== P2PMessageType.CONVERSATION_EXPORT_END) throw new Error("Invalid export end message: wrong type byte");
  const jsonStr = textDecoder.decode(data.slice(1));
  const parsed = JSON.parse(jsonStr);
  return ConversationExportEndSchema.parse(parsed);
}
function decodeP2PMessage(data) {
  if (data.length === 0) throw new Error("Cannot decode empty message");
  const type = data[0];
  if (type === void 0) throw new Error("Message type byte is missing");
  switch (type) {
    case P2PMessageType.CONVERSATION_EXPORT_START:
      return {
        type: "export_start",
        payload: decodeExportStartMessage(data)
      };
    case P2PMessageType.CONVERSATION_CHUNK:
      return {
        type: "chunk",
        payload: decodeChunkMessage(data)
      };
    case P2PMessageType.CONVERSATION_EXPORT_END:
      return {
        type: "export_end",
        payload: decodeExportEndMessage(data)
      };
    default:
      throw new Error(`Unknown P2P message type: 0x${type.toString(16)}`);
  }
}
function assertNeverP2PMessage(msg) {
  throw new Error(`Unhandled P2P message type: ${JSON.stringify(msg)}`);
}
var PLAN_INDEX_DOC_NAME = "plan-index";
var PLAN_INDEX_VIEWED_BY_KEY = "viewedBy";
var NON_PLAN_DB_NAMES = ["plan-index", "idb-keyval"];
var PlanIndexEntrySchema = z3.discriminatedUnion("deleted", [z3.object({
  deleted: z3.literal(false),
  id: z3.string(),
  title: z3.string(),
  status: z3.enum(PlanStatusValues),
  createdAt: z3.number(),
  updatedAt: z3.number(),
  ownerId: z3.string(),
  tags: z3.array(z3.string()).optional()
}), z3.object({
  deleted: z3.literal(true),
  id: z3.string(),
  title: z3.string(),
  status: z3.enum(PlanStatusValues),
  createdAt: z3.number(),
  updatedAt: z3.number(),
  ownerId: z3.string(),
  tags: z3.array(z3.string()).optional(),
  deletedAt: z3.number(),
  deletedBy: z3.string()
})]);
function getPlanIndex(ydoc, includeArchived = false) {
  const plansMap = ydoc.getMap(YDOC_KEYS.PLANS);
  const entries = [];
  for (const [_id, data] of plansMap.entries()) {
    const result = PlanIndexEntrySchema.safeParse(data);
    if (result.success) {
      if (!includeArchived && result.data.deleted) continue;
      entries.push(result.data);
    }
  }
  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}
function getPlanIndexEntry(ydoc, planId) {
  const data = ydoc.getMap(YDOC_KEYS.PLANS).get(planId);
  if (!data) return null;
  const result = PlanIndexEntrySchema.safeParse(data);
  return result.success ? result.data : null;
}
function setPlanIndexEntry(ydoc, entry) {
  const validated = PlanIndexEntrySchema.parse(entry);
  ydoc.getMap(YDOC_KEYS.PLANS).set(validated.id, validated);
}
function removePlanIndexEntry(ydoc, planId) {
  ydoc.getMap(YDOC_KEYS.PLANS).delete(planId);
}
function touchPlanIndexEntry(ydoc, planId) {
  const entry = getPlanIndexEntry(ydoc, planId);
  if (entry) setPlanIndexEntry(ydoc, {
    ...entry,
    updatedAt: Date.now()
  });
}
function getViewedByFromIndex(ydoc, planId) {
  const planViewedBy = ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY).get(planId);
  if (!planViewedBy || !(planViewedBy instanceof Y2.Map)) return {};
  const result = {};
  for (const [username, timestamp] of planViewedBy.entries()) if (typeof timestamp === "number") result[username] = timestamp;
  return result;
}
function updatePlanIndexViewedBy(ydoc, planId, username) {
  ydoc.transact(() => {
    const viewedByRoot = ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY);
    let planViewedBy = viewedByRoot.get(planId);
    if (!planViewedBy || !(planViewedBy instanceof Y2.Map)) {
      planViewedBy = new Y2.Map();
      viewedByRoot.set(planId, planViewedBy);
    }
    planViewedBy.set(username, Date.now());
  });
}
function clearPlanIndexViewedBy(ydoc, planId, username) {
  ydoc.transact(() => {
    const planViewedBy = ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY).get(planId);
    if (planViewedBy && planViewedBy instanceof Y2.Map) planViewedBy.delete(username);
  });
}
function getAllViewedByFromIndex(ydoc, planIds) {
  const result = {};
  for (const planId of planIds) result[planId] = getViewedByFromIndex(ydoc, planId);
  return result;
}
function removeViewedByFromIndex(ydoc, planId) {
  ydoc.getMap(PLAN_INDEX_VIEWED_BY_KEY).delete(planId);
}
var PLAN_INDEX_EVENT_VIEWED_BY_KEY = "event-viewedBy";
function markEventAsViewed(ydoc, planId, eventId, username) {
  const viewedByRoot = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY);
  let planEvents = viewedByRoot.get(planId);
  if (!planEvents) {
    planEvents = new Y2.Map();
    viewedByRoot.set(planId, planEvents);
  }
  let eventViews = planEvents.get(eventId);
  if (!eventViews) {
    eventViews = new Y2.Map();
    planEvents.set(eventId, eventViews);
  }
  eventViews.set(username, Date.now());
}
function clearEventViewedBy(ydoc, planId, eventId, username) {
  const planEvents = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY).get(planId);
  if (!planEvents) return;
  const eventViews = planEvents.get(eventId);
  if (!eventViews) return;
  eventViews.delete(username);
}
function isEventUnread(ydoc, planId, eventId, username) {
  const planEvents = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY).get(planId);
  if (!planEvents) return true;
  const eventViews = planEvents.get(eventId);
  if (!eventViews) return true;
  return !eventViews.has(username);
}
function getAllEventViewedByForPlan(ydoc, planId) {
  const planEvents = ydoc.getMap(PLAN_INDEX_EVENT_VIEWED_BY_KEY).get(planId);
  if (!planEvents) return {};
  const result = {};
  for (const [eventId, eventViews] of planEvents.entries()) {
    const views = eventViews;
    result[eventId] = Object.fromEntries(views.entries());
  }
  return result;
}
var ROUTES = {
  REGISTRY_LIST: "/registry",
  REGISTRY_REGISTER: "/register",
  REGISTRY_UNREGISTER: "/unregister",
  PLAN_STATUS: (planId) => `/api/plan/${planId}/status`,
  PLAN_HAS_CONNECTIONS: (planId) => `/api/plan/${planId}/has-connections`,
  PLAN_TRANSCRIPT: (planId) => `/api/plan/${planId}/transcript`,
  PLAN_SUBSCRIBE: (planId) => `/api/plan/${planId}/subscribe`,
  PLAN_CHANGES: (planId) => `/api/plan/${planId}/changes`,
  PLAN_UNSUBSCRIBE: (planId) => `/api/plan/${planId}/unsubscribe`,
  PLAN_PR_DIFF: (planId, prNumber) => `/api/plans/${planId}/pr-diff/${prNumber}`,
  PLAN_PR_FILES: (planId, prNumber) => `/api/plans/${planId}/pr-files/${prNumber}`,
  HOOK_SESSION: "/api/hook/session",
  HOOK_CONTENT: (planId) => `/api/hook/plan/${planId}/content`,
  HOOK_REVIEW: (planId) => `/api/hook/plan/${planId}/review`,
  HOOK_SESSION_TOKEN: (planId) => `/api/hook/plan/${planId}/session-token`,
  HOOK_PRESENCE: (planId) => `/api/hook/plan/${planId}/presence`,
  CONVERSATION_IMPORT: "/api/conversation/import"
};
function formatThreadsForLLM(threads, options = {}) {
  const { includeResolved = false, selectedTextMaxLength = 100, resolveUser } = options;
  const unresolvedThreads = threads.filter((t$1) => !t$1.resolved);
  const resolvedCount = threads.length - unresolvedThreads.length;
  const threadsToShow = includeResolved ? threads : unresolvedThreads;
  if (threadsToShow.length === 0) {
    if (resolvedCount > 0) return `All ${resolvedCount} comment(s) have been resolved.`;
    return "";
  }
  let output = threadsToShow.map((thread, index) => {
    const location = thread.selectedText ? `On: "${truncate(thread.selectedText, selectedTextMaxLength)}"` : `Comment ${index + 1}`;
    const comments = thread.comments.map((c, idx) => {
      const text = extractTextFromCommentBody(c.body);
      const author = resolveUser ? resolveUser(c.userId) : c.userId.slice(0, 8);
      if (idx === 0) return `${author}: ${text}`;
      return `${author} (reply): ${text}`;
    }).join("\n");
    return `${location}${thread.resolved ? " [Resolved]" : ""}
${comments}`;
  }).join("\n\n");
  if (!includeResolved && resolvedCount > 0) output += `

---
(${resolvedCount} resolved comment(s) not shown)`;
  return output;
}
function truncate(text, maxLength) {
  const cleaned = text.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}...`;
}
var PlanIdSchema = z3.object({ planId: z3.string().min(1) });
var PlanStatusResponseSchema = z3.object({ status: z3.string() });
var HasConnectionsResponseSchema = z3.object({ hasConnections: z3.boolean() });
var SubscriptionClientIdSchema = z3.object({
  planId: z3.string().min(1),
  clientId: z3.string().min(1)
});
var ChangeTypeSchema = z3.enum([
  "status",
  "comments",
  "resolved",
  "content",
  "artifacts"
]);
var ChangeSchema = z3.object({
  type: ChangeTypeSchema,
  timestamp: z3.number(),
  summary: z3.string(),
  details: z3.record(z3.string(), z3.unknown()).optional()
});
var ChangesResponseSchema = z3.discriminatedUnion("ready", [z3.object({
  ready: z3.literal(true),
  changes: z3.string(),
  details: z3.array(ChangeSchema)
}), z3.object({
  ready: z3.literal(false),
  pending: z3.number(),
  windowExpiresIn: z3.number()
})]);
var DeleteSubscriptionResponseSchema = z3.object({ success: z3.boolean() });
var SetSessionTokenRequestSchema = z3.object({ sessionTokenHash: z3.string().min(1) });
var GetDeliverableContextRequestSchema = z3.object({ sessionToken: z3.string().min(1) });
var GetDeliverableContextResponseSchema = z3.object({ context: z3.string() });
var SetSessionTokenResponseSchema = z3.object({ url: z3.string() });
var ImportConversationRequestSchema = z3.object({
  a2aMessages: z3.array(A2AMessageSchema),
  meta: z3.object({
    planId: z3.string().optional(),
    sourcePlatform: z3.string().optional(),
    sessionId: z3.string().optional()
  }).optional()
});
var ImportConversationResponseSchema = z3.discriminatedUnion("success", [z3.object({
  success: z3.literal(true),
  sessionId: z3.string(),
  transcriptPath: z3.string(),
  messageCount: z3.number()
}), z3.object({
  success: z3.literal(false),
  error: z3.string()
})]);
var t = initTRPC.context().create({ allowOutsideOfServer: true });
var router = t.router;
var publicProcedure = t.procedure;
var middleware = t.middleware;
var conversationRouter = router({ import: publicProcedure.input(ImportConversationRequestSchema).output(ImportConversationResponseSchema).mutation(async ({ input, ctx }) => {
  return ctx.conversationHandlers.importConversation(input, ctx);
}) });
var hookRouter = router({
  createSession: publicProcedure.input(CreateHookSessionRequestSchema).output(CreateHookSessionResponseSchema).mutation(async ({ input, ctx }) => {
    return ctx.hookHandlers.createSession(input, ctx);
  }),
  updateContent: publicProcedure.input(PlanIdSchema.merge(UpdatePlanContentRequestSchema)).output(UpdatePlanContentResponseSchema).mutation(async ({ input, ctx }) => {
    const { planId, ...contentInput } = input;
    return ctx.hookHandlers.updateContent(planId, contentInput, ctx);
  }),
  getReviewStatus: publicProcedure.input(PlanIdSchema).output(GetReviewStatusResponseSchema).query(async ({ input, ctx }) => {
    return ctx.hookHandlers.getReviewStatus(input.planId, ctx);
  }),
  updatePresence: publicProcedure.input(PlanIdSchema.merge(UpdatePresenceRequestSchema)).output(UpdatePresenceResponseSchema).mutation(async ({ input, ctx }) => {
    const { planId, ...presenceInput } = input;
    return ctx.hookHandlers.updatePresence(planId, presenceInput, ctx);
  }),
  setSessionToken: publicProcedure.input(PlanIdSchema.merge(SetSessionTokenRequestSchema)).output(SetSessionTokenResponseSchema).mutation(async ({ input, ctx }) => {
    const { planId, sessionTokenHash } = input;
    return ctx.hookHandlers.setSessionToken(planId, sessionTokenHash, ctx);
  }),
  waitForApproval: publicProcedure.input(z3.object({
    planId: z3.string(),
    reviewRequestId: z3.string()
  })).output(z3.object({
    approved: z3.boolean(),
    feedback: z3.string().optional(),
    deliverables: z3.array(z3.any()).optional(),
    reviewComment: z3.string().optional(),
    reviewedBy: z3.string().optional(),
    status: z3.string().optional()
  })).mutation(async ({ input, ctx }) => {
    const { planId, reviewRequestId } = input;
    return ctx.hookHandlers.waitForApproval(planId, reviewRequestId, ctx);
  }),
  getDeliverableContext: publicProcedure.input(PlanIdSchema.merge(GetDeliverableContextRequestSchema)).output(GetDeliverableContextResponseSchema).query(async ({ input, ctx }) => {
    const { planId, sessionToken } = input;
    return ctx.hookHandlers.getDeliverableContext(planId, sessionToken, ctx);
  }),
  getSessionContext: publicProcedure.input(z3.object({ sessionId: z3.string() })).output(z3.discriminatedUnion("found", [z3.object({
    found: z3.literal(true),
    planId: z3.string(),
    sessionToken: z3.string(),
    url: z3.string(),
    deliverables: z3.array(z3.object({
      id: z3.string(),
      text: z3.string()
    })),
    reviewComment: z3.string().optional(),
    reviewedBy: z3.string().optional(),
    reviewStatus: z3.string().optional()
  }), z3.object({ found: z3.literal(false) })])).query(async ({ input, ctx }) => {
    return ctx.hookHandlers.getSessionContext(input.sessionId, ctx);
  })
});
var planRouter = router({
  getStatus: publicProcedure.input(PlanIdSchema).output(PlanStatusResponseSchema).query(async ({ input, ctx }) => {
    const metadata = getPlanMetadata(await ctx.getOrCreateDoc(input.planId));
    if (!metadata) throw new TRPCError({
      code: "NOT_FOUND",
      message: "Plan not found"
    });
    return { status: metadata.status };
  }),
  hasConnections: publicProcedure.input(PlanIdSchema).output(HasConnectionsResponseSchema).query(async ({ input, ctx }) => {
    return { hasConnections: await ctx.getPlanStore().hasActiveConnections(input.planId) };
  })
});
var subscriptionRouter = router({
  create: publicProcedure.input(PlanIdSchema.merge(CreateSubscriptionRequestSchema)).output(CreateSubscriptionResponseSchema).mutation(async ({ input, ctx }) => {
    const { planId, subscribe, windowMs, maxWindowMs, threshold } = input;
    return { clientId: ctx.getPlanStore().createSubscription({
      planId,
      subscribe: subscribe || ["status"],
      windowMs: windowMs ?? 5e3,
      maxWindowMs: maxWindowMs ?? 3e4,
      threshold: threshold ?? 1
    }) };
  }),
  getChanges: publicProcedure.input(SubscriptionClientIdSchema).output(ChangesResponseSchema).query(async ({ input, ctx }) => {
    const { planId, clientId } = input;
    const result = ctx.getPlanStore().getChanges(planId, clientId);
    if (!result) throw new TRPCError({
      code: "NOT_FOUND",
      message: "Subscription not found"
    });
    return result;
  }),
  delete: publicProcedure.input(SubscriptionClientIdSchema).output(DeleteSubscriptionResponseSchema).mutation(async ({ input, ctx }) => {
    const { planId, clientId } = input;
    return { success: ctx.getPlanStore().deleteSubscription(planId, clientId) };
  })
});
var appRouter = router({
  hook: hookRouter,
  plan: planRouter,
  subscription: subscriptionRouter,
  conversation: conversationRouter
});
function createUserResolver(ydoc, fallbackLength = 8) {
  const usersMap = ydoc.getMap("users");
  return (userId) => {
    return usersMap.get(userId)?.displayName ?? userId.slice(0, fallbackLength);
  };
}

export {
  PlanStatusValues,
  PlanViewTabValues,
  OriginPlatformValues,
  ClaudeCodeOriginMetadataSchema,
  DevinOriginMetadataSchema,
  CursorOriginMetadataSchema,
  OriginMetadataSchema,
  parseClaudeCodeOrigin,
  ConversationVersionSchema,
  PlanEventTypes,
  AgentActivityTypes,
  AgentActivityDataSchema,
  PlanEventSchema,
  isInboxWorthy,
  PlanMetadataSchema,
  ArtifactSchema,
  getArtifactUrl,
  DeliverableSchema,
  PlanSnapshotSchema,
  LinkedPRStatusValues,
  LinkedPRSchema,
  PRReviewCommentSchema,
  createLinkedPR,
  createGitHubArtifact,
  createLocalArtifact,
  createInitialConversationVersion,
  createHandedOffConversationVersion,
  assertNever,
  AgentPresenceSchema,
  ReviewCommentSchema,
  ReviewFeedbackSchema,
  CreateHookSessionRequestSchema,
  CreateHookSessionResponseSchema,
  UpdatePlanContentRequestSchema,
  UpdatePlanContentResponseSchema,
  GetReviewStatusResponseSchema,
  UpdatePresenceRequestSchema,
  UpdatePresenceResponseSchema,
  HookApiErrorSchema,
  RegisterServerRequestSchema,
  RegisterServerResponseSchema,
  UnregisterServerRequestSchema,
  UnregisterServerResponseSchema,
  CreateSubscriptionRequestSchema,
  CreateSubscriptionResponseSchema,
  InputRequestTypeValues,
  InputRequestStatusValues,
  InputRequestSchema,
  createInputRequest,
  YDOC_KEYS,
  isValidYDocKey,
  ThreadCommentSchema,
  ThreadSchema,
  isThread,
  parseThreads,
  extractTextFromCommentBody,
  extractMentions,
  VALID_STATUS_TRANSITIONS,
  getPlanMetadata,
  getPlanMetadataWithValidation,
  setPlanMetadata,
  transitionPlanStatus,
  initPlanMetadata,
  getStepCompletions,
  toggleStepCompletion,
  isStepCompleted,
  getArtifacts,
  addArtifact,
  removeArtifact,
  getAgentPresences,
  setAgentPresence,
  clearAgentPresence,
  getAgentPresence,
  getDeliverables,
  addDeliverable,
  linkArtifactToDeliverable,
  getPlanOwnerId,
  isApprovalRequired,
  getApprovedUsers,
  isUserApproved,
  approveUser,
  revokeUser,
  getRejectedUsers,
  isUserRejected,
  rejectUser,
  unrejectUser,
  getLinkedPRs,
  linkPR,
  unlinkPR,
  getLinkedPR,
  updateLinkedPRStatus,
  getPRReviewComments,
  getPRReviewCommentsForPR,
  addPRReviewComment,
  resolvePRReviewComment,
  removePRReviewComment,
  markPlanAsViewed,
  getViewedBy,
  isPlanUnread,
  getConversationVersions,
  addConversationVersion,
  markVersionHandedOff,
  logPlanEvent,
  getPlanEvents,
  getSnapshots,
  addSnapshot,
  createPlanSnapshot,
  getLatestSnapshot,
  addPlanTag,
  removePlanTag,
  getAllTagsFromIndex,
  archivePlan,
  unarchivePlan,
  answerInputRequest,
  cancelInputRequest,
  isUrlEncodedPlanV1,
  isUrlEncodedPlanV2,
  encodePlan,
  decodePlan,
  createPlanUrl,
  createPlanUrlWithHistory,
  getPlanFromUrl,
  A2ATextPartSchema,
  A2ADataPartSchema,
  A2AFilePartSchema,
  A2APartSchema,
  A2AMessageSchema,
  ConversationExportMetaSchema,
  ClaudeCodeMessageSchema,
  parseClaudeCodeTranscriptString,
  claudeCodeToA2A,
  validateA2AMessages,
  summarizeA2AConversation,
  a2aToClaudeCode,
  formatAsClaudeCodeJSONL,
  formatDeliverablesForLLM,
  extractDeliverables,
  GitHubPRResponseSchema,
  asPlanId,
  asAwarenessClientId,
  asWebRTCPeerId,
  asGitHubUsername,
  InviteTokenSchema,
  InviteRedemptionSchema,
  parseInviteFromUrl,
  buildInviteUrl,
  getTokenTimeRemaining,
  P2PMessageType,
  ConversationExportStartMetaSchema,
  ChunkMessageSchema,
  ConversationExportEndSchema,
  isConversationExportStart,
  isConversationChunk,
  isConversationExportEnd,
  isP2PConversationMessage,
  encodeExportStartMessage,
  decodeExportStartMessage,
  encodeChunkMessage,
  decodeChunkMessage,
  encodeExportEndMessage,
  decodeExportEndMessage,
  decodeP2PMessage,
  assertNeverP2PMessage,
  PLAN_INDEX_DOC_NAME,
  PLAN_INDEX_VIEWED_BY_KEY,
  NON_PLAN_DB_NAMES,
  PlanIndexEntrySchema,
  getPlanIndex,
  getPlanIndexEntry,
  setPlanIndexEntry,
  removePlanIndexEntry,
  touchPlanIndexEntry,
  getViewedByFromIndex,
  updatePlanIndexViewedBy,
  clearPlanIndexViewedBy,
  getAllViewedByFromIndex,
  removeViewedByFromIndex,
  PLAN_INDEX_EVENT_VIEWED_BY_KEY,
  markEventAsViewed,
  clearEventViewedBy,
  isEventUnread,
  getAllEventViewedByForPlan,
  ROUTES,
  formatThreadsForLLM,
  PlanIdSchema,
  PlanStatusResponseSchema,
  HasConnectionsResponseSchema,
  SubscriptionClientIdSchema,
  ChangeTypeSchema,
  ChangeSchema,
  ChangesResponseSchema,
  DeleteSubscriptionResponseSchema,
  SetSessionTokenRequestSchema,
  SetSessionTokenResponseSchema,
  ImportConversationRequestSchema,
  ImportConversationResponseSchema,
  conversationRouter,
  hookRouter,
  planRouter,
  subscriptionRouter,
  appRouter,
  createUserResolver
};
