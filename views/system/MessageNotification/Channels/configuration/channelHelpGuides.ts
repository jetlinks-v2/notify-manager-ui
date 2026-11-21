// Legacy illustrations and explanations are adapted to the current configuration fields.
export interface ChannelHelpGuide {
  kind: string
  link?: { labelKey: string; href: string }
  sections: {
    id: string
    fields: string[]
    titleKey: string
    blocks: ({ type: 'text'; key: string } | { type: 'image'; image: string })[]
  }[]
}

export const channelHelpGuides: Record<string, ChannelHelpGuide> = {
  "weixin:corpMessage": {
    "kind": "weixin",
    "sections": [
      {
        "id": "corpId",
        "fields": [
          "corpId"
        ],
        "titleKey": "messageNotification.channels.document.titles.corpId",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.weixin.corpId.description"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.weixin.corpId.path"
          },
          {
            "type": "image",
            "image": "corpId"
          }
        ]
      },
      {
        "id": "corpSecret",
        "fields": [
          "corpSecret"
        ],
        "titleKey": "messageNotification.channels.document.titles.corpSecret",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.weixin.corpSecret.description"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.weixin.corpSecret.path"
          },
          {
            "type": "image",
            "image": "corpSecret"
          }
        ]
      },
      {
        "id": "weixinAgentId",
        "fields": [
          "agentId"
        ],
        "titleKey": "NoticeCenter.template.field.agentId",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.weixin.agentId.description"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.weixin.agentId.path"
          },
          {
            "type": "image",
            "image": "weixinAgentId"
          }
        ]
      }
    ],
    "link": {
      "labelKey": "messageNotification.channels.document.platform.weixin",
      "href": "https://work.weixin.qq.com"
    }
  },
  "weixin:officialMessage": {
    "kind": "official",
    "sections": [
      {
        "id": "appId",
        "fields": [
          "appId"
        ],
        "titleKey": "messageNotification.channels.document.titles.appId",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.official.appId.description"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.official.path"
          },
          {
            "type": "image",
            "image": "officialAppId"
          }
        ]
      },
      {
        "id": "officialSecret",
        "fields": [
          "secret"
        ],
        "titleKey": "messageNotification.channels.document.titles.officialSecret",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.official.secret.description"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.official.path"
          },
          {
            "type": "image",
            "image": "officialAppSecret"
          }
        ]
      }
    ],
    "link": {
      "labelKey": "messageNotification.channels.document.platform.official",
      "href": "https://mp.weixin.qq.com/"
    }
  },
  "dingTalk:dingTalkMessage": {
    "kind": "dingTalk",
    "sections": [
      {
        "id": "appKey",
        "fields": [
          "appKey"
        ],
        "titleKey": "messageNotification.channels.document.titles.appKey",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.dingTalk.appKey.description"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.dingTalk.path"
          },
          {
            "type": "image",
            "image": "dingTalkAppKey"
          }
        ]
      },
      {
        "id": "dingTalkAgentId",
        "fields": [
          "agentId"
        ],
        "titleKey": "messageNotification.channels.document.titles.dingTalkAgentId",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.dingTalk.agentId.description"
          },
          {
            "type": "image",
            "image": "dingTalkAgentId"
          }
        ]
      },
      {
        "id": "appSecret",
        "fields": [
          "appSecret"
        ],
        "titleKey": "messageNotification.channels.document.titles.appSecret",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.dingTalk.appSecret.description"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.dingTalk.path"
          },
          {
            "type": "image",
            "image": "dingTalkAppSecret"
          }
        ]
      }
    ],
    "link": {
      "labelKey": "messageNotification.channels.document.platform.dingTalk",
      "href": "https://open-dev.dingtalk.com"
    }
  },
  "dingTalk:dingTalkRobotWebHook": {
    "kind": "robot",
    "sections": [
      {
        "id": "robotWebhook",
        "fields": [
          "url"
        ],
        "titleKey": "messageNotification.channels.document.titles.robotWebhook",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.robot.description"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.robot.path"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.robot.step1"
          },
          {
            "type": "image",
            "image": "robotGroup"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.robot.step2"
          },
          {
            "type": "image",
            "image": "robotSettings"
          },
          {
            "type": "image",
            "image": "robotWebhook"
          }
        ]
      }
    ]
  },
  "email:embedded": {
    "kind": "email",
    "sections": [
      {
        "id": "emailPreset",
        "fields": [
          "email:preset"
        ],
        "titleKey": "messageNotification.channels.document.titles.emailPreset",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.preset"
          }
        ]
      },
      {
        "id": "host",
        "fields": [
          "host"
        ],
        "titleKey": "messageNotification.channels.document.titles.host",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.host"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.smtp"
          }
        ]
      },
      {
        "id": "port",
        "fields": [
          "port"
        ],
        "titleKey": "messageNotification.channels.document.titles.port",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.port"
          }
        ]
      },
      {
        "id": "encryption",
        "fields": [
          "email:encryption",
          "properties"
        ],
        "titleKey": "messageNotification.channels.document.titles.encryption",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.encryption"
          }
        ]
      },
      {
        "id": "sender",
        "fields": [
          "sender"
        ],
        "titleKey": "messageNotification.channels.document.titles.sender",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.sender"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.senderDefault"
          }
        ]
      },
      {
        "id": "username",
        "fields": [
          "username"
        ],
        "titleKey": "messageNotification.channels.document.titles.username",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.username"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.account"
          }
        ]
      },
      {
        "id": "password",
        "fields": [
          "password"
        ],
        "titleKey": "messageNotification.channels.document.titles.password",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.password"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.email.authorization"
          }
        ]
      }
    ]
  },
  "sms:aliyunSms": {
    "kind": "sms",
    "sections": [
      {
        "id": "regionId",
        "fields": [
          "regionId"
        ],
        "titleKey": "messageNotification.channels.document.titles.regionId",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.aliyun.region"
          }
        ]
      },
      {
        "id": "accessKeyId",
        "fields": [
          "accessKeyId"
        ],
        "titleKey": "messageNotification.channels.document.titles.accessKeyId",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.aliyun.accessKeyId"
          },
          {
            "type": "image",
            "image": "aliyunAccessKey"
          }
        ]
      },
      {
        "id": "accessKeySecret",
        "fields": [
          "secret"
        ],
        "titleKey": "messageNotification.channels.document.titles.accessKeySecret",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.aliyun.secret"
          },
          {
            "type": "image",
            "image": "aliyunAccessKey"
          }
        ]
      },
      {
        "id": "smsTemplate",
        "fields": ["code", "signName"],
        "titleKey": "messageNotification.channels.guidance.sms.steps.2.title",
        "blocks": [{ "type": "text", "key": "messageNotification.channels.guidance.sms.steps.2.description" }]
      }
    ],
    "link": {
      "labelKey": "messageNotification.channels.document.platform.aliyun",
      "href": "https://home.console.aliyun.com"
    }
  },
  "voice:aliyun": {
    "kind": "voice",
    "sections": [
      {
        "id": "regionId",
        "fields": [
          "regionId"
        ],
        "titleKey": "messageNotification.channels.document.titles.regionId",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.aliyun.region"
          }
        ]
      },
      {
        "id": "accessKeyId",
        "fields": [
          "accessKeyId"
        ],
        "titleKey": "messageNotification.channels.document.titles.accessKeyId",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.aliyun.accessKeyId"
          },
          {
            "type": "image",
            "image": "aliyunAccessKey"
          }
        ]
      },
      {
        "id": "accessKeySecret",
        "fields": [
          "secret"
        ],
        "titleKey": "messageNotification.channels.document.titles.accessKeySecret",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.aliyun.secret"
          },
          {
            "type": "image",
            "image": "aliyunAccessKey"
          }
        ]
      },
      {
        "id": "voiceTemplate",
        "fields": ["templateType", "templateCode"],
        "titleKey": "messageNotification.channels.guidance.voice.steps.2.title",
        "blocks": [{ "type": "text", "key": "messageNotification.channels.guidance.voice.steps.2.description" }]
      }
    ],
    "link": {
      "labelKey": "messageNotification.channels.document.platform.aliyun",
      "href": "https://home.console.aliyun.com"
    }
  },
  "webhook:http": {
    "kind": "webhook",
    "sections": [
      {
        "id": "url",
        "fields": [
          "url"
        ],
        "titleKey": "messageNotification.channels.document.titles.url",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.webhook.url"
          }
        ]
      },
      {
        "id": "headers",
        "fields": [
          "headers"
        ],
        "titleKey": "messageNotification.channels.document.titles.headers",
        "blocks": [
          {
            "type": "text",
            "key": "messageNotification.channels.document.webhook.headers"
          },
          {
            "type": "text",
            "key": "messageNotification.channels.document.webhook.headerValues"
          }
        ]
      }
    ]
  }
}
