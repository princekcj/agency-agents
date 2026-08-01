  const loadRuns = async (id) => {
    const toggled = { ...expandedRuns, [id]: !expandedRuns[id] };
    setExpandedRuns(toggled);
    if (toggled[id]) {
      const res = await fetch(`/api/schedules/${id}/runs`);
      const data = res.ok ? await res.json() : [];
      setRuns(r => ({ ...r, [id]: data }));
    }
  };