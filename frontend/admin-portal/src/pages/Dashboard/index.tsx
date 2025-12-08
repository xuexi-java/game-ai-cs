import { useState, useEffect, useMemo } from 'react';
import { Row, Col, Card, Statistic, DatePicker, Select, Spin, Typography } from 'antd';
import {
  FileTextOutlined,
  CustomerServiceOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StarOutlined,
  UserOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { getDashboardMetrics } from '../../services/dashboard.service';
import { getGames } from '../../services/game.service';
import { getUsers } from '../../services/user.service';
import { useAgentStore } from '../../stores/agentStore';
import type { DashboardMetrics, Game } from '../../types';
import './index.css';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Title } = Typography;

const DashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'day'),
    dayjs()
  ]);
  const agentStats = metrics?.agentStats ?? [];
  const allAgents = useAgentStore((state) => state.allAgents);
  const setAllAgents = useAgentStore((state) => state.setAllAgents);

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [metricsData, gamesData] = await Promise.all([
        getDashboardMetrics({
          gameId: selectedGameId || undefined,
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
        }),
        getGames(),
      ]);
      
      setMetrics(metricsData);
      // 确保 gamesData 是数组
      setGames(Array.isArray(gamesData) ? gamesData : []);
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedGameId, dateRange]);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const response = await getUsers({
          role: 'AGENT',
          page: 1,
          pageSize: 500,
        });
        const agents =
          response?.items?.map((agent) => ({
            id: agent.id,
            username: agent.username,
            realName: agent.realName,
            avatar: agent.avatar,
            isOnline: !!agent.isOnline,
            lastLoginAt: agent.lastLoginAt,
          })) ?? [];
        setAllAgents(agents);
      } catch (error) {
        console.error('加载客服列表失败:', error);
      }
    };

    loadAgents();
  }, [setAllAgents]);

  // 每日统计图表配置
  const getDailyStatsChartOption = () => {
    if (!metrics?.dailyStats) return {};

    return {
      title: {
        text: '每日工单统计',
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
        },
      },
      legend: {
        data: ['新增工单', '已解决', '满意度'],
        bottom: 0,
      },
      xAxis: {
        type: 'category',
        data: metrics.dailyStats.map(item => dayjs(item.date).format('MM-DD')),
      },
      yAxis: [
        {
          type: 'value',
          name: '工单数量',
          position: 'left',
        },
        {
          type: 'value',
          name: '满意度',
          position: 'right',
          min: 0,
          max: 5,
        },
      ],
      series: [
        {
          name: '新增工单',
          type: 'bar',
          data: metrics.dailyStats.map(item => item.tickets),
          itemStyle: {
            color: '#1890ff',
          },
        },
        {
          name: '已解决',
          type: 'bar',
          data: metrics.dailyStats.map(item => item.resolved),
          itemStyle: {
            color: '#52c41a',
          },
        },
        {
          name: '满意度',
          type: 'line',
          yAxisIndex: 1,
          data: metrics.dailyStats.map(item => item.avgSatisfaction),
          itemStyle: {
            color: '#faad14',
          },
        },
      ],
    };
  };

  // 转人工率趋势图表配置
  const getTransferRateChartOption = () => {
    if (!metrics?.dailyStats) return {};

    return {
      title: {
        text: '转人工率趋势',
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal',
        },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const param = params[0];
          return `${param.name}<br/>${param.seriesName}: ${param.value}%`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: metrics.dailyStats.map((item) =>
          dayjs(item.date).format('MM-DD'),
        ),
      },
      yAxis: {
        type: 'value',
        name: '转人工率 (%)',
        min: 0,
        max: 100,
        axisLabel: {
          formatter: '{value}%',
        },
      },
      series: [
        {
          name: '转人工率',
          type: 'line',
          smooth: true,
          data: metrics.dailyStats.map((item) => item.transferRate || 0),
          itemStyle: {
            color: '#ff4d4f',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255, 77, 79, 0.3)' },
                { offset: 1, color: 'rgba(255, 77, 79, 0.1)' },
              ],
            },
          },
          markPoint: {
            data: [
              { type: 'max', name: '最大值' },
              { type: 'min', name: '最小值' },
            ],
          },
          markLine: {
            data: [{ type: 'average', name: '平均值' }],
          },
        },
      ],
    };
  };

  // AI拦截率趋势图表配置
  const getAIInterceptionRateChartOption = () => {
    if (!metrics?.dailyStats) return {};

    return {
      title: {
        text: 'AI拦截率趋势',
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal',
        },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const param = params[0];
          return `${param.name}<br/>${param.seriesName}: ${param.value}%`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: metrics.dailyStats.map((item) =>
          dayjs(item.date).format('MM-DD'),
        ),
      },
      yAxis: {
        type: 'value',
        name: '拦截率 (%)',
        min: 0,
        max: 100,
        axisLabel: {
          formatter: '{value}%',
        },
      },
      series: [
        {
          name: 'AI拦截率',
          type: 'line',
          smooth: true,
          data: metrics.dailyStats.map(
            (item) => item.aiInterceptionRate || 0,
          ),
          itemStyle: {
            color: '#52c41a',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
                { offset: 1, color: 'rgba(82, 196, 26, 0.1)' },
              ],
            },
          },
          markPoint: {
            data: [
              { type: 'max', name: '最大值' },
              { type: 'min', name: '最小值' },
            ],
          },
          markLine: {
            data: [{ type: 'average', name: '平均值' }],
          },
        },
      ],
    };
  };

  // 客服统计图表配置
  const getAgentStatsChartOption = () => {
    if (!metrics?.agentStats || metrics.agentStats.length === 0) return {};

    const agentCount = metrics.agentStats.length;
    // 根据客服数量动态调整柱状图宽度
    const barWidth = agentCount === 1 ? '30%' : agentCount === 2 ? '40%' : agentCount <= 3 ? '50%' : agentCount <= 5 ? '45%' : '35%';

    return {
      title: {
        show: false, // 移除标题，使用 Card 的 title
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: {
            color: 'rgba(114, 46, 209, 0.1)',
          },
        },
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderColor: '#d9d9d9',
        borderWidth: 1,
        borderRadius: 8,
        padding: [12, 16],
        textStyle: {
          color: '#333',
          fontSize: 13,
        },
        formatter: (params: any) => {
          let result = `<div style="font-weight: 600; margin-bottom: 8px; color: #333; font-size: 14px;">${params[0].axisValue}</div>`;
          params.forEach((param: any) => {
            const icon = param.seriesName === '处理工单' ? '📋' : '⭐';
            const unit = param.seriesName === '处理工单' ? '单' : '分';
            const value = param.seriesName === '处理工单' 
              ? param.value 
              : param.value > 0 ? param.value.toFixed(1) : '0.0';
            result += `<div style="display: flex; align-items: center; margin: 6px 0;">
              <span style="display:inline-block;width:12px;height:12px;background:${param.color};border-radius:2px;margin-right:8px;"></span>
              <span style="margin-right: 4px;">${icon}</span>
              <span style="color: #666;">${param.seriesName}:</span>
              <span style="font-weight: 600; color: #333; margin-left: 8px;">${value}${unit}</span>
            </div>`;
          });
          return result;
        },
      },
      legend: {
        data: ['处理工单', '平均评分'],
        bottom: 8,
        itemGap: 24,
        itemWidth: 14,
        itemHeight: 14,
        textStyle: {
          fontSize: 12,
          color: '#666',
          fontWeight: 500,
        },
        icon: 'roundRect',
      },
      grid: {
        left: '8%',
        right: '8%',
        bottom: agentCount > 5 ? '18%' : '15%',
        top: '12%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: metrics.agentStats.map(item => item.agentName),
        axisLabel: {
          rotate: agentCount > 5 ? 45 : 0,
          fontSize: 12,
          color: '#666',
          interval: 0,
          margin: 12,
          fontWeight: 500,
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: '#e8e8e8',
            width: 1,
          },
        },
        axisTick: {
          show: true,
          alignWithLabel: true,
          length: 4,
          lineStyle: {
            color: '#e8e8e8',
          },
        },
      },
      yAxis: [
        {
          type: 'value',
          name: '工单数量',
          position: 'left',
          nameLocation: 'middle',
          nameGap: 50,
          nameTextStyle: {
            color: '#722ed1',
            fontSize: 12,
            fontWeight: 600,
          },
          axisLabel: {
            color: '#8c8c8c',
            fontSize: 11,
            fontWeight: 500,
          },
          axisLine: {
            show: true,
            lineStyle: {
              color: '#722ed1',
              width: 2,
            },
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: '#f5f5f5',
              type: 'solid',
              width: 1,
            },
          },
          splitNumber: 4,
        },
        {
          type: 'value',
          name: '评分',
          position: 'right',
          min: 0,
          max: 5,
          nameLocation: 'middle',
          nameGap: 50,
          nameTextStyle: {
            color: '#eb2f96',
            fontSize: 12,
            fontWeight: 600,
          },
          axisLabel: {
            color: '#8c8c8c',
            fontSize: 11,
            fontWeight: 500,
            formatter: '{value}',
          },
          axisLine: {
            show: true,
            lineStyle: {
              color: '#eb2f96',
              width: 2,
            },
          },
          splitLine: {
            show: false,
          },
          splitNumber: 5,
        },
      ],
      series: [
        {
          name: '处理工单',
          type: 'bar',
          data: metrics.agentStats.map(item => item.handledTickets),
          barWidth: barWidth,
          barMaxWidth: 80,
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: '#b37feb', // 更浅的紫色
                },
                {
                  offset: 0.5,
                  color: '#9254de', // 中等紫色
                },
                {
                  offset: 1,
                  color: '#722ed1', // 深紫色
                },
              ],
            },
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 12,
            shadowColor: 'rgba(114, 46, 209, 0.25)',
            shadowOffsetY: 4,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 18,
              shadowColor: 'rgba(114, 46, 209, 0.4)',
              shadowOffsetY: 6,
            },
            focus: 'series',
          },
          label: {
            show: true,
            position: 'top',
            color: '#722ed1',
            fontSize: 12,
            fontWeight: 600,
            formatter: '{c}',
            offset: [0, -4],
          },
          animationDelay: (idx: number) => idx * 100,
        },
        {
          name: '平均评分',
          type: 'line',
          yAxisIndex: 1,
          data: metrics.agentStats.map(item => item.averageRating),
          smooth: true,
          lineStyle: {
            color: '#ff4d9a',
            width: 3,
            type: 'solid',
          },
          itemStyle: {
            color: '#ff4d9a',
            borderWidth: 3,
            borderColor: '#fff',
          },
          symbol: 'circle',
          symbolSize: (value: number) => value > 0 ? 10 : 0,
          label: {
            show: true,
            position: 'top',
            color: '#ff4d9a',
            fontSize: 12,
            fontWeight: 600,
            formatter: (params: any) => {
              return params.value > 0 ? params.value.toFixed(1) : '';
            },
            offset: [0, -8],
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderColor: '#ff4d9a',
            borderWidth: 1,
            borderRadius: 4,
            padding: [2, 6],
          },
          areaStyle: {
            show: false, // 移除面积填充，让图表更简洁
          },
          animationDelay: (idx: number) => idx * 100 + 50,
        },
      ],
      animation: true,
      animationDuration: 1000,
      animationEasing: 'cubicOut',
    };
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <Title level={2}>仪表盘</Title>
        <div className="dashboard-filters">
          <Select
            placeholder="选择游戏"
            style={{ width: 200, marginRight: 16 }}
            value={selectedGameId ? selectedGameId : undefined}
            onChange={(value) => setSelectedGameId(value || '')}
            allowClear
            loading={games.length === 0}
            notFoundContent={games.length === 0 ? '暂无游戏，请先创建游戏' : undefined}
            showSearch
            filterOption={(input, option) => {
              const label = String(option?.label || '');
              return label.toLowerCase().includes(input.toLowerCase());
            }}
          >
            {Array.isArray(games) &&
              games.length > 0 &&
              games.map((game) => {
                const gameName = game.name || `游戏 ${game.id}`;
                return (
                  <Option key={game.id} value={game.id} label={gameName}>
                    {gameName}
                  </Option>
                );
              })}
          </Select>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (!dates || !dates[0] || !dates[1]) {
                return;
              }
              setDateRange([dates[0], dates[1]]);
            }}
            format="YYYY-MM-DD"
            allowClear={false}
          />
        </div>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} className="stats-cards">
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总工单数"
              value={metrics?.totalTickets || 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="未关闭工单"
              value={metrics?.openTickets || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已关闭工单"
              value={metrics?.closedTickets || 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均满意度"
              value={metrics?.satisfactionRating || 0}
              precision={1}
              prefix={<StarOutlined />}
              suffix="/ 5"
              valueStyle={{ color: '#eb2f96' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 响应时间统计 */}
      <Row gutter={[16, 16]} className="response-stats">
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="平均响应时间"
              value={metrics?.averageResponseTime || 0}
              suffix="秒"
              prefix={<CustomerServiceOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="平均解决时间"
              value={Math.round((metrics?.averageResolutionTime || 0) / 60)}
              suffix="分钟"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card>
            <Statistic
              title="AI拦截率"
              value={metrics?.aiInterceptionRate || 0}
              suffix="%"
              prefix={<UserOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={[16, 16]} className="charts-section">
        <Col xs={24} lg={12}>
          <Card title="每日统计趋势">
            <ReactECharts
              key="daily-stats"
              option={getDailyStatsChartOption()}
              style={{ height: '400px' }}
              opts={{ renderer: 'canvas' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="客服工作统计">
            <ReactECharts
              key="agent-stats"
              option={getAgentStatsChartOption()}
              style={{ height: '400px' }}
              opts={{ renderer: 'canvas' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="AI拦截率趋势">
            <ReactECharts
              key="ai-interception-rate"
              option={getAIInterceptionRateChartOption()}
              style={{ height: '400px' }}
              opts={{ renderer: 'canvas' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="转人工率趋势">
            <ReactECharts
              key="transfer-rate"
              option={getTransferRateChartOption()}
              style={{ height: '400px' }}
              opts={{ renderer: 'canvas' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 在线客服列表 */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="在线客服状态">
            <Row gutter={[16, 16]}>
              {allAgents.map((agent) => {
                const stats = agentStats.find(
                  (stat) => stat.agentId === agent.id,
                );
                return (
                  <Col xs={24} sm={12} md={8} lg={6} key={agent.id}>
                    <Card
                      size="small"
                      className={`agent-card ${agent.isOnline ? 'online' : 'offline'}`}
                    >
                      <div className="agent-info">
                        <UserOutlined className="agent-icon" />
                        <div className="agent-details">
                          <div className="agent-name">
                            {agent.realName || agent.username}
                          </div>
                          <div className="agent-status">
                            {agent.isOnline ? '在线' : '离线'}
                          </div>
                        </div>
                      </div>
                      <div className="agent-stats">
                        <div>处理: {stats?.handledTickets ?? 0}</div>
                        <div>
                          评分:{' '}
                          {stats
                            ? stats.averageRating.toFixed(1)
                            : (agent as any).averageRating?.toFixed?.(1) ||
                              '0.0'}
                        </div>
                      </div>
                    </Card>
                  </Col>
                );
              })}
              {allAgents.length === 0 && (
                <Col span={24}>
                  <div className="online-agents-empty">暂无客服数据</div>
                </Col>
              )}
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
