
import { Task } from '../task'

export interface Verb {
    name?: string
    run?: (step: Task) => void
}
