import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JobSidebar from '../components/JobSidebar'
import { getDisplayMatchScore, getJobId, normalizeStatus } from '../lib/jobs'
import { getAppliedDate, daysSince, buildSplinePath } from '../lib/dashboardUtils'

import DashboardHeader from '../components/dashboard/DashboardHeader'
import { ActionCards } from '../components/dashboard/ActionCards'
import { PipelineStats } from '../components/dashboard/PipelineStats'
import { PriorityFollowUps } from '../components/dashboard/PriorityFollowUps'
import { ActivityChart } from '../components/dashboard/ActivityChart'
import { JobRecommendations } from '../components/dashboard/JobRecommendations'
import './TodaysJobs.css'

const TodaysJobs = ({ jobs = [], onStatusChange, onDelete }) => {
  const navigate = useNavigate()
  const [selectedJob, setSelectedJob] = useState(null)

  // 2. DATA AGGREGATION & PIPELINE HOOKS
  const rankedJobs = useMemo(
    () => jobs.filter(j => normalizeStatus(j.Status) !== 'skipped').sort((left, right) => getDisplayMatchScore(right) - getDisplayMatchScore(left)),
    [jobs],
  )

  const topMatches = rankedJobs.slice(0, 3)

  const appliedCount = jobs.filter((job) => normalizeStatus(job.Status) === 'applied').length
  const interviewingCount = jobs.filter((job) => normalizeStatus(job.Status) === 'interviewing').length
  const offersCount = jobs.filter((job) => normalizeStatus(job.Status) === 'accepted').length
  const screeningCount = jobs.filter((job) => { const s = normalizeStatus(job.Status); return s === 'screening' || s === 'technical' }).length

  // Priority follow-up calculations
  const priorityFollowUps = useMemo(() => {
    return jobs
      .filter(j => normalizeStatus(j.Status) === 'applied')
      .map(j => ({ job: j, days: daysSince(getAppliedDate(j)) }))
      .filter(x => x.days !== null && x.days >= 7)
      .sort((a, b) => b.days - a.days)
      .slice(0, 3)
  }, [jobs])

  const displayFollowUps = priorityFollowUps

  // Spline Chart Coordinates calculations
  const spline = useMemo(() => buildSplinePath(jobs), [jobs])

  // Sidebar controls
  const selectedIndex = selectedJob ? rankedJobs.findIndex((job) => getJobId(job) === getJobId(selectedJob)) : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < rankedJobs.length - 1
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // 2. RENDER PIPELINE
  return (
    <section className="tj-dashboard">
      <DashboardHeader todayStr={todayStr} onLogApplication={() => navigate('/applied')} />

      <div className="tj-focus-grid-top">
        <ActionCards navigate={navigate} />
        <PipelineStats
          appliedCount={appliedCount}
          screeningCount={screeningCount}
          interviewingCount={interviewingCount}
          offersCount={offersCount}
        />
      </div>

      <div className="tj-focus-grid-mid">
        <PriorityFollowUps
          displayFollowUps={displayFollowUps}
          onViewAll={() => navigate('/applied')}
          onFollowUp={setSelectedJob}
        />
        <ActivityChart spline={spline} />
      </div>

      <JobRecommendations topMatches={topMatches} setSelectedJob={setSelectedJob} onViewAll={() => navigate('/jobs')} onTailor={(job) => navigate(`/tailor?job=${encodeURIComponent(job.id)}`)} onSave={(job) => onStatusChange?.(job, 'not_applied')} />

      <JobSidebar
        job={selectedJob}
        open={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        onStatusChange={(id, v) => onStatusChange(id, v)}
        onDelete={(id) => { onDelete(id); setSelectedJob(null); }}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onPrev={() => setSelectedJob(rankedJobs[selectedIndex - 1])}
        onNext={() => setSelectedJob(rankedJobs[selectedIndex + 1])}
      />
    </section>
  )
}

export default TodaysJobs
