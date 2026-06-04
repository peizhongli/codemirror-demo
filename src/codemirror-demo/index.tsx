import { Button, Message } from '@arco-design/web-react'

import FormulaEditor, { DEFAULT_EXAMPLE_FORMULAS } from './FormulaEditor'
import { evaluateFormula } from './evaluateFormula'
import type { SupportedFunctionType } from './constants'

interface Props {
  formulaRef?: React.MutableRefObject<string>
}

export default function CodemirrorFormulaDemo({ formulaRef }: Props) {
  const handleCompute = () => {
    const code = formulaRef?.current ?? ''
    const res = evaluateFormula(code)
    if (res.ok) {
      Message.success(`计算结果：${JSON.stringify(res.value)}`)
      console.log('HyperFormula 计算结果:', res.value)
    } else {
      Message.error(res.error || '公式有误')
    }
  }

  // 配置只支持的函数类型
  const supportedFunctions: SupportedFunctionType[] = ['AVERAGE', 'MAX', 'MIN', 'SUM']

  return (
    <div style={{ width: '100%' }}>
      <FormulaEditor
        supportedFunctions={supportedFunctions}
        exampleFormulas={DEFAULT_EXAMPLE_FORMULAS}
        onChange={(val) => {
          if (formulaRef) formulaRef.current = val
        }}
      />
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" onClick={handleCompute}>
          计算
        </Button>
      </div>
    </div>
  )
}
