Component({
  properties: {
    chartData: {
      type: Object,
      value: { categories: [], series: [{ name: '收入', data: [] }] },
    },
  },

  data: {
    bars: [],
    selectedIndex: -1,
  },

  observers: {
    chartData() {
      this.buildBars();
    },
  },

  lifetimes: {
    attached() {
      this.buildBars();
    },
  },

  methods: {
    buildBars() {
      const chartData = this.properties.chartData || {};
      const categories = Array.isArray(chartData.categories) ? chartData.categories : [];
      const series = Array.isArray(chartData.series) ? chartData.series : [];
      const values = Array.isArray(series[0]?.data) ? series[0].data : [];
      const max = Math.max(...values, 1);
      const bars = categories.map((label, index) => {
        const value = Number(values[index]) || 0;
        return {
          label,
          value,
          displayMoney: (Math.round(value * 100) / 100).toFixed(2),
          heightPct: value > 0 ? Math.max(8, Math.round((value / max) * 100)) : 0,
        };
      });
      this.setData({ bars, selectedIndex: -1 });
    },

    onBarTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (Number.isNaN(index)) return;
      const next = this.data.selectedIndex === index ? -1 : index;
      this.setData({ selectedIndex: next });
    },
  },
});
