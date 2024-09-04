// import './index.less';
import { Image } from 'ant-design-vue';
import { templateImages } from '../../data';

const WeixinCorp = () => {
  const agentId = templateImages.weixinAgentId;
  const userId = templateImages.weixinUserID;
  const toDept = templateImages.weixinToDept;
  const toTags = templateImages.weixinToTags;

  return (
    <div class="doc">
      <div class="url">
        企业微信管理后台：
        <a href="https://work.weixin.qq.com" target="_blank" rel="noopener noreferrer">
          https://work.weixin.qq.com
        </a>
      </div>
      <h1>1. 概述</h1>
      <div>
        通知模板结合通知配置为告警消息通知提供支撑。通知模板只能调用同一类型的通知配置服务。
      </div>
      <h1>2.模板配置说明</h1>
      <div>
        <h2> 1、绑定配置</h2>
        <div> 使用固定的通知配置发送此通知模板</div>
        <h2> 2、Agentid</h2>
        <div> 应用唯一标识</div>
        <div> 获取路径：“企业微信”管理后台--“应用管理”--“应用”--“查看应用”</div>
        <div class="image">
          <Image width="100%" src={agentId} />
        </div>
        <h2> 3、收信人ID、收信部门ID、标签推送</h2>
        <div>
          接收通知的3种方式，3个字段若在此页面都没有填写，则在模板调试和配置告警通知时需要手动填写
        </div>
        <div> 收信人ID获取路径：【通讯录】-{'>'}【成员信息】查看成员账号</div>
        <div> 收信组织ID获取路径：【通讯录】-{'>'}【部门信息】查看部门ID</div>
        <div class="image">
          <Image width="100%" src={userId} />
          <Image width="100%" src={toDept} />
          <Image width="100%" src={toTags} />
        </div>
      </div>
    </div>
  );
};
export default WeixinCorp;
