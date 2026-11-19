import corpId from '../../../../../assets/notice/doc/config/weixin-corp/01-corpId.jpg'
import corpSecret from '../../../../../assets/notice/doc/config/weixin-corp/02-corpSecret.jpg'
import weixinAgentId from '../../../../../assets/notice/doc/template/weixin-corp/01-Agentid.jpg'
import officialAppId from '../../../../../assets/notice/doc/config/weixin-official/01-AppID.jpg'
import officialAppSecret from '../../../../../assets/notice/doc/config/weixin-official/02-AppSecret.jpg'
import dingTalkAppKey from '../../../../../assets/notice/doc/config/dingTalk-message/01-AppKey.jpg'
import dingTalkAppSecret from '../../../../../assets/notice/doc/config/dingTalk-message/02-AppSecret.jpg'
import dingTalkAgentId from '../../../../../assets/notice/doc/template/dingTalk-message/01-Agentid.jpg'
import robotGroup from '../../../../../assets/notice/doc/config/dingTalk-rebot/01-group-setting.jpg'
import robotSettings from '../../../../../assets/notice/doc/config/dingTalk-rebot/02-rebot.jpg'
import robotWebhook from '../../../../../assets/notice/doc/config/dingTalk-rebot/03-Webhook.jpg'
import aliyunAccessKey from '../../../../../assets/notice/doc/config/aliyun-sms-voice/AccesskeyIDSecret.jpg'

// Dimensions reserve space so field navigation remains stable while images load.
export const channelHelpImages: Record<string, { src: string; width: number; height: number }> = {
  corpId: { src: corpId, width: 1244, height: 937 },
  corpSecret: { src: corpSecret, width: 1232, height: 460 },
  weixinAgentId: { src: weixinAgentId, width: 1234, height: 655 },
  officialAppId: { src: officialAppId, width: 1855, height: 761 },
  officialAppSecret: { src: officialAppSecret, width: 1848, height: 765 },
  dingTalkAppKey: { src: dingTalkAppKey, width: 1897, height: 621 },
  dingTalkAppSecret: { src: dingTalkAppSecret, width: 1890, height: 622 },
  dingTalkAgentId: { src: dingTalkAgentId, width: 1896, height: 623 },
  robotGroup: { src: robotGroup, width: 1269, height: 790 },
  robotSettings: { src: robotSettings, width: 1276, height: 788 },
  robotWebhook: { src: robotWebhook, width: 1277, height: 791 },
  aliyunAccessKey: { src: aliyunAccessKey, width: 1906, height: 616 },
}
